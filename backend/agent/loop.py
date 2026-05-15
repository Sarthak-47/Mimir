"""
Mimir — ReAct Agent Loop
Reason → Act → Observe → Respond

Uses ollama.AsyncClient so all LLM calls are non-blocking.
Sync tool functions are dispatched via asyncio.to_thread so they
never stall the FastAPI event loop.
"""

import asyncio
import json
import re
from typing import AsyncGenerator

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)

def _strip_think(text: str) -> str:
    """Remove ``<think>…</think>`` blocks emitted by reasoning-capable models."""
    return _THINK_RE.sub("", text).lstrip()

import ollama

from config import settings
from agent.prompts import SYSTEM_PROMPT
from agent.tools import (
    tool_explain, tool_quiz, tool_summarize,
    tool_flashcards, tool_schedule, tool_recall, tool_weak_topics,
)
from memory.vector import query_memory

# ── Async Ollama client (singleton) ─────────────────────────
_client = ollama.AsyncClient(host=settings.ollama_base_url)

def _ollama_opts(**extra) -> dict:
    """Build an Ollama ``options`` dict, appending ``num_gpu`` only when explicitly configured.

    Passing ``num_gpu`` when it is -1 (auto) would override Ollama's own GPU
    detection, so we omit it in that case.
    """
    opts = {"temperature": settings.ollama_temperature, **extra}
    if settings.ollama_num_gpu >= 0:
        opts["num_gpu"] = settings.ollama_num_gpu
    return opts

# ── Tool registry ────────────────────────────────────────────
TOOLS = {
    "explain":     tool_explain,
    "quiz":        tool_quiz,
    "summarize":   tool_summarize,
    "flashcards":  tool_flashcards,
    "schedule":    tool_schedule,
    "recall":      tool_recall,
    "weak_topics": tool_weak_topics,
}

REACT_SYSTEM = SYSTEM_PROMPT + """

You have access to the following tools. To use one, output EXACTLY:
ACTION: <tool_name>
ARGS: <JSON object>

Available tools:
- explain(concept, depth)                                     — explain a concept
- quiz(topic, subject, n)                                     — generate MCQ questions (returns JSON)
- summarize(content)                                          — summarize text / notes
- flashcards(topic, n)                                        — generate flashcard pairs (returns JSON)
- schedule(subject, topics, days_until_exam, weak_topics)     — build revision plan
- recall(past_messages)                                       — summarize past study sessions
- weak_topics(topic_scores)                                   — identify weak areas

If no tool is needed, respond directly without ACTION/ARGS lines.
"""


async def run_agent(
    user_message: str,
    user_id: int,
    conversation_history: list[dict],
    topic_scores: list[dict] | None = None,
    subject_id: int | None = None,
    subject_name: str = "",
) -> AsyncGenerator[str, None]:
    """Run one ReAct iteration and stream response tokens.

    Execution flow:
        1. Retrieve semantically relevant past sessions from ChromaDB.
        2. Build a context prompt combining memory, recent history, and weak topics.
        3. First LLM call (non-streaming) decides whether a tool is needed.
        4. If the model outputs ``ACTION``/``ARGS``, dispatch the tool off the
           event loop via ``asyncio.to_thread``.
        5. Second LLM call (streaming) synthesises the tool result into prose.
        6. If no tool is needed, skip steps 4–5 and stream a direct reply.

    Tool results that are dicts or lists are appended as a special
    ``__TOOL_DATA__:<json>`` sentinel so the WebSocket handler can send them
    as a separate ``tool_data`` frame without mixing them into the text stream.

    Args:
        user_message: The raw message typed by the student.
        user_id: Authenticated user's database ID (for memory scoping).
        conversation_history: Up to 20 recent messages as ``{role, content}`` dicts.
        topic_scores: Optional list of ``{name, confidence_score}`` dicts for the
            active subject, used to surface weak areas in the context prompt.
        subject_id: Active subject's DB ID for memory filtering.
        subject_name: Display name of the active subject.

    Yields:
        Text tokens from the streaming LLM response, then optionally a
        ``__TOOL_DATA__:<json>`` sentinel string.
    """

    # ── 1. Semantic memory recall ────────────────────────────
    past_docs = query_memory(user_id, user_message, n_results=5, subject_id=subject_id)
    memory_ctx = "\n".join(past_docs) if past_docs else "No relevant past sessions."

    # ── 2. Build context prompt ──────────────────────────────
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}"
        for m in conversation_history[-10:]
    )

    weak_summary = ""
    if topic_scores:
        weak = [t for t in topic_scores if t.get("confidence_score", 100) < 60]
        if weak:
            weak_summary = "Weak topics: " + ", ".join(
                f"{t['name']} ({t['confidence_score']:.0f}%)" for t in weak
            )

    context_prompt = (
        f"[PAST SESSIONS]\n{memory_ctx}\n\n"
        f"[RECENT CONVERSATION]\n{history_text}\n\n"
        f"[STUDENT CONTEXT]\n"
        f"Active subject: {subject_name or 'None'}\n"
        f"{weak_summary}\n\n"
        f"[STUDENT MESSAGE]\n{user_message}"
    )

    # ── 3. First LLM call — reason / decide ──────────────────
    messages: list[dict] = [
        {"role": "system", "content": REACT_SYSTEM},
        {"role": "user",   "content": context_prompt},
    ]

    first = await _client.chat(
        model=settings.ollama_model,
        messages=messages,
        options=_ollama_opts(),
    )
    raw: str = _strip_think(first["message"]["content"])

    # ── 4. Parse ACTION / ARGS ────────────────────────────────
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

            # ── 5. Execute tool off the event loop ────────────
            try:
                observation = await asyncio.to_thread(
                    tool_fn, **args if isinstance(args, dict) else {}
                )
            except Exception as exc:
                observation = f"Tool error: {exc}"

            obs_str = (
                json.dumps(observation, indent=2)
                if not isinstance(observation, str)
                else observation
            )

            # ── 6. Second LLM call — synthesise + stream ──────
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
            ):
                yield chunk["message"]["content"]

            # Append structured data marker for the WebSocket handler
            if isinstance(observation, (list, dict)):
                yield f"\n\n__TOOL_DATA__:{json.dumps(observation)}"

        else:
            # Unknown tool name — fall back to raw LLM text
            yield raw

    else:
        # ── Direct response — no tool needed ─────────────────
        direct: list[dict] = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": context_prompt},
        ]
        async for chunk in await _client.chat(
            model=settings.ollama_model,
            messages=direct,
            options=_ollama_opts(),
            stream=True,
        ):
            yield chunk["message"]["content"]
