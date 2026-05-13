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
    """
    Async generator yielding response tokens to the WebSocket handler.
    Single ReAct iteration: Reason → (Act → Observe)? → Stream response.
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
        options={"temperature": settings.ollama_temperature},
    )
    raw: str = first["message"]["content"]

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
                options={"temperature": settings.ollama_temperature},
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
            options={"temperature": settings.ollama_temperature},
            stream=True,
        ):
            yield chunk["message"]["content"]
