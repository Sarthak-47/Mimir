"""
Mimir — ReAct Agent Loop
Reason → Act → Observe → Respond

Uses a single streaming Ollama call with a short peek window to detect
whether the model wants to use a tool.  This means the first token reaches
the browser in ~5 s rather than ~50 s (the old non-streaming first call).

Direct-answer path (≈80 % of requests):
    stream starts → peek 80 chars → no ACTION found → flush buffer →
    continue streaming live → done

Tool path (≈20 % of requests):
    stream starts → peek 80 chars → ACTION found → drain stream for ARGS →
    execute tool → second streaming call for synthesis → done
"""

import asyncio
import json
import re
from typing import AsyncGenerator

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)

def _strip_think(text: str) -> str:
    """Remove ``<think>…</think>`` blocks emitted by reasoning-capable models."""
    return _THINK_RE.sub("", text).lstrip()


def _detect_confusion(history: list[dict], current_msg: str) -> str:
    """Detect confusion signals in the recent conversation.

    Scans the last six turns for explicit confusion phrases or repeated short
    messages (a sign the student is asking the same thing again). Returns a
    hint string that is injected into the model's context prompt.

    Returns an empty string when no confusion is detected so the context
    prompt stays clean.
    """
    confusion_signals = [
        "don't understand", "do not understand", "confused", "confusing",
        "what do you mean", "can you explain again", "explain again",
        "i'm lost", "i am lost", "doesn't make sense", "does not make sense",
        "not clear", "makes no sense", "still don't", "lost me",
        "i don't get", "i do not get", "what?", "huh", "unclear",
    ]
    recent = history[-6:] if len(history) >= 6 else history
    user_msgs = [m["content"].lower() for m in recent if m["role"] == "user"]
    user_msgs.append(current_msg.lower())

    signal_count = sum(
        1 for msg in user_msgs for signal in confusion_signals if signal in msg
    )
    # Detect repeated short messages — student asking the same thing again
    short_msgs = [m for m in user_msgs if len(m.split()) <= 7]
    repeated = len(short_msgs) >= 3 and len(set(short_msgs[-3:])) <= 2

    if signal_count >= 2 or repeated:
        return (
            "CONFUSION DETECTED: Student appears confused. "
            "Simplify your explanation, use concrete analogies, slow down, "
            "and check understanding before continuing."
        )
    if signal_count == 1:
        return "POSSIBLE CONFUSION: Consider briefly checking the student's understanding."
    return ""


import ollama

from config import settings
from agent.prompts import (
    SYSTEM_PROMPT, FAST_SYSTEM_PROMPT,
    BEGINNER_PROMPT, EXAM_PROMPT, CODING_PROMPT, DERIVATION_PROMPT,
    SOCRATIC_PROMPT,
)
from agent.tools import (
    tool_quiz, tool_summarize,
    tool_flashcards, tool_weak_topics,
)
from memory.vector import query_memory_hybrid
from memory.database import AsyncSessionLocal

# ── Mode → system prompt mapping ────────────────────────────
_MODE_PROMPTS: dict[str, str] = {
    "detailed":   SYSTEM_PROMPT,
    "fast":       FAST_SYSTEM_PROMPT,
    "beginner":   BEGINNER_PROMPT,
    "exam":       EXAM_PROMPT,
    "coding":     CODING_PROMPT,
    "derivation": DERIVATION_PROMPT,
    "socratic":   SOCRATIC_PROMPT,
}

# ── Async Ollama client (singleton) ─────────────────────────
_client = ollama.AsyncClient(host=settings.ollama_base_url)

def _ollama_opts(**extra) -> dict:
    """Build an Ollama ``options`` dict, appending ``num_gpu`` only when explicitly configured."""
    opts = {"temperature": settings.ollama_temperature, **extra}
    if settings.ollama_num_gpu >= 0:
        opts["num_gpu"] = settings.ollama_num_gpu
    return opts

# ── Tool registry ────────────────────────────────────────────
TOOLS = {
    "quiz":        tool_quiz,
    "summarize":   tool_summarize,
    "flashcards":  tool_flashcards,
    "weak_topics": tool_weak_topics,
}

# How many characters to buffer before deciding tool vs direct.
# ACTION: quiz\nARGS: is ~20 chars, so 80 gives plenty of margin.
_PEEK_CHARS = 80


def _args_complete(text: str) -> bool:
    """Return True once the ARGS JSON object in *text* has balanced braces."""
    if "ARGS:" not in text:
        return False
    args_part = text[text.find("ARGS:") + 5:].strip()
    if not args_part.startswith("{"):
        return False
    depth = 0
    for ch in args_part:
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return True
    return False


async def run_agent(
    user_message: str,
    user_id: int,
    conversation_history: list[dict],
    topic_scores: list[dict] | None = None,
    subject_id: int | None = None,
    subject_name: str = "",
    mode: str = "detailed",
) -> AsyncGenerator[str, None]:
    """Run one ReAct iteration and stream response tokens.

    Uses a **single streaming Ollama call** with an 80-character peek window:

    * If the model starts with ``ACTION: <tool>`` it is a tool call — we drain
      the stream until ``ARGS`` is complete, execute the tool, then make a
      second streaming call to synthesise the result.
    * Otherwise it is a direct answer — we flush the peek buffer and continue
      streaming the rest of the response live.

    This means the browser receives the first token in ~5 s (peek window) for
    direct answers, vs ~50 s with the old non-streaming first call.

    Yields:
        Text tokens, then optionally sentinel strings:
        ``__ACTION__:<tool>``       — tool was invoked
        ``__TOOL_DATA__:<json>``    — structured quiz/flashcard data
        ``__SOURCES__:<json>``      — source file names retrieved from memory
    """

    # ── 1. Hybrid memory recall (vector + BM25 RRF) ──────────
    past_docs, retrieved_sources = query_memory_hybrid(
        user_id, user_message, n_results=5, subject_id=subject_id,
        candidate_pool=20,
    )
    memory_ctx = "\n".join(past_docs) if past_docs else "No relevant past sessions."

    # ── 2. Build context prompt ──────────────────────────────
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in conversation_history[-10:]
    )

    weak_summary = ""
    difficulty_hint = ""
    adaptive_hint = ""
    weak_concepts: list[str] = []
    if topic_scores:
        weak = [t for t in topic_scores if t.get("confidence_score", 100) < 60]
        if weak:
            weak_summary = "Weak topics: " + ", ".join(
                f"{t['name']} ({t['confidence_score']:.0f}%)" for t in weak
            )
            weak_concepts = [t["name"] for t in weak]
            adaptive_hint = (
                "Adaptive quiz hint: when generating a quiz, focus questions on "
                + ", ".join(weak_concepts[:5])
                + " — these are the student's weakest areas."
            )
        avg_conf = sum(t.get("confidence_score", 50) for t in topic_scores) / len(topic_scores)
        if avg_conf >= 80:
            difficulty_hint = "Student proficiency: high — use \"hard\" difficulty for quizzes."
        elif avg_conf >= 60:
            difficulty_hint = "Student proficiency: medium — use \"medium\" difficulty for quizzes."
        else:
            difficulty_hint = "Student proficiency: low — use \"easy\" difficulty for quizzes."

    # ── Confusion detection ──────────────────────────────────
    confusion_hint = _detect_confusion(conversation_history, user_message)

    # ── Misconception recall from DB ─────────────────────────
    misconception_ctx = ""
    try:
        from memory.database import Misconception as _MiscModel
        from sqlalchemy import select as _select
        async with AsyncSessionLocal() as _db:
            _res = await _db.execute(
                _select(_MiscModel)
                .where(_MiscModel.user_id == user_id)
                .order_by(_MiscModel.count.desc())
                .limit(5)
            )
            _miscs = _res.scalars().all()
            if _miscs:
                _id_map = {t["id"]: t["name"] for t in (topic_scores or []) if "id" in t}
                _parts = [
                    f"{_id_map.get(m.topic_id, f'topic#{m.topic_id}')} (failed {m.count}x)"
                    for m in _miscs
                ]
                misconception_ctx = "Recurring misconceptions (student repeatedly struggles with): " + ", ".join(_parts)
    except Exception:
        pass   # Misconception table may not exist yet on first boot

    context_prompt = (
        f"[PAST SESSIONS]\n{memory_ctx}\n\n"
        f"[RECENT CONVERSATION]\n{history_text}\n\n"
        f"[STUDENT CONTEXT]\n"
        f"Active subject: {subject_name or 'None'}\n"
        f"{weak_summary}\n"
        f"{difficulty_hint}\n"
        f"{adaptive_hint}\n"
        f"{misconception_ctx}\n"
        f"{confusion_hint}\n\n"
        f"[STUDENT MESSAGE]\n{user_message}"
    )

    # ── 3. Build messages ────────────────────────────────────
    active_prompt = _MODE_PROMPTS.get(mode, SYSTEM_PROMPT)
    react_system  = active_prompt + """

You have access to the following tools. To use one, output EXACTLY:
ACTION: <tool_name>
ARGS: <JSON object>

Available tools:
- quiz(topic, subject, n)       — generate MCQ questions (returns JSON)
- flashcards(topic, n)          — generate flashcard pairs (returns JSON)
- summarize(content)            — summarize uploaded text / notes
- weak_topics(topic_scores)     — identify weak areas from scores

For everything else — explanations, revision schedules, recalling past sessions, answering questions — respond directly without ACTION/ARGS lines.
"""
    messages: list[dict] = [
        {"role": "system", "content": react_system},
        {"role": "user",   "content": context_prompt},
    ]

    # ── 4. Single streaming call with peek window ─────────────
    #
    # We buffer the first _PEEK_CHARS characters to decide:
    #   • ACTION: detected → tool path  (don't yield the scaffold to user)
    #   • no ACTION        → direct path (flush buffer, stream the rest live)
    #
    full    = ""           # all chars accumulated so far
    peek_buf: list[str] = []  # tokens in the peek window
    decided  = False       # True once we've passed _PEEK_CHARS
    is_tool  = False       # True when ACTION: was found

    async for chunk in await _client.chat(
        model=settings.ollama_model,
        messages=messages,
        options=_ollama_opts(),
        stream=True,
        think=False,
    ):
        tok = chunk["message"]["content"]
        full += tok

        if not decided:
            # ── still inside peek window ──────────────────────
            peek_buf.append(tok)
            if len(full) >= _PEEK_CHARS:
                decided = True
                is_tool = bool(re.search(r"ACTION:\s*\w+", full))
                if not is_tool:
                    # Direct answer confirmed — flush peek buffer immediately
                    for t in peek_buf:
                        yield t
                    peek_buf = []

        elif not is_tool:
            # ── direct path — stream tokens live ─────────────
            yield tok

        else:
            # ── tool path — keep buffering until ARGS complete ─
            peek_buf.append(tok)
            if _args_complete(full):
                break   # have everything we need; generator closes here

    # Handle responses that finished before the peek window filled
    if not decided and peek_buf:
        is_tool = bool(re.search(r"ACTION:\s*\w+", full))
        if not is_tool:
            for t in peek_buf:
                yield t

    raw = _strip_think(full)

    # ── 5. Tool execution + synthesis ────────────────────────
    if is_tool:
        action_m = re.search(r"ACTION:\s*(\w+)", raw)
        args_m   = re.search(r"ARGS:\s*(\{.*?\}|\[.*?\])", raw, re.DOTALL)

        if action_m:
            tool_name = action_m.group(1).strip()
            tool_fn   = TOOLS.get(tool_name)

            if tool_fn:
                args: dict = {}
                if args_m:
                    try:
                        args = json.loads(args_m.group(1))
                    except json.JSONDecodeError:
                        args = {}

                try:
                    observation = await asyncio.to_thread(
                        tool_fn, **args if isinstance(args, dict) else {}
                    )
                except Exception as exc:
                    observation = f"Tool error: {exc}"

                # Signal to the frontend which tool was used
                yield f"__ACTION__:{tool_name}"

                obs_str = (
                    json.dumps(observation, indent=2)
                    if not isinstance(observation, str)
                    else observation
                )

                # Synthesis call — stream the tool result as prose
                messages.append({"role": "assistant", "content": raw})
                messages.append({
                    "role": "user",
                    "content": (
                        f"[TOOL RESULT — {tool_name}]\n{obs_str}\n\n"
                        "Now respond to the student using this result."
                    ),
                })

                async for chunk in await _client.chat(
                    model=settings.ollama_model,
                    messages=messages,
                    options=_ollama_opts(),
                    stream=True,
                    think=False,
                ):
                    yield chunk["message"]["content"]

                # Structured data marker for the WebSocket handler
                if isinstance(observation, (list, dict)):
                    yield f"\n\n__TOOL_DATA__:{json.dumps(observation)}"

            else:
                # Unknown tool name — strip scaffolding, yield whatever prose remains
                cleaned = re.sub(r"^(ACTION|ARGS):.*$", "", raw, flags=re.MULTILINE).strip()
                yield cleaned if cleaned else raw

    # ── 6. Source grounding — always last ─────────────────────
    if retrieved_sources:
        yield f"__SOURCES__:{json.dumps(retrieved_sources)}"
