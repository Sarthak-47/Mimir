"""
Mimir — ReAct Agent Loop
Reason → Act → Observe → Respond

Flow:
  1. Retrieve relevant memory (ChromaDB + SQLite topic history)
  2. Build prompt with system role + memory + user message
  3. LLM decides: respond directly OR call a tool
  4. If tool: execute → observe result → fold back into response
  5. Stream final response to frontend via WebSocket
  6. Save turn to SQLite + ChromaDB
"""

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
from memory.vector import query_memory, add_memory


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

# ── ReAct prompt template ─────────────────────────────────────

REACT_SYSTEM = SYSTEM_PROMPT + """

You have access to the following tools. To use one, output:
ACTION: <tool_name>
ARGS: <JSON args>

Available tools:
- explain(concept, depth)         — explain a concept
- quiz(topic, subject, n)         — generate MCQ questions (returns JSON)
- summarize(content)              — summarize text/notes
- flashcards(topic, n)            — generate flashcards (returns JSON)
- schedule(subject, topics, days_until_exam, weak_topics) — revision plan
- recall(past_messages)           — summarize past study sessions
- weak_topics(topic_scores)       — identify weak areas

If no tool is needed, just respond directly.
"""


# ── Main loop ─────────────────────────────────────────────────

async def run_agent(
    user_message: str,
    user_id: int,
    conversation_history: list[dict],
    topic_scores: list[dict] | None = None,
    subject_id: int | None = None,
    subject_name: str = "",
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields response chunks to the WebSocket handler.
    Implements a single ReAct iteration (Reason → Act → Respond).
    """

    # ── 1. Retrieve semantic memory ──────────────────────────
    past_docs = query_memory(user_id, user_message, n_results=5, subject_id=subject_id)
    memory_context = "\n".join(past_docs) if past_docs else "No relevant past sessions."

    # ── 2. Build context prompt ──────────────────────────────
    recent_history = conversation_history[-10:]  # last 5 turns
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in recent_history
    )

    weak_summary = ""
    if topic_scores:
        weak = [t for t in topic_scores if t.get("confidence_score", 100) < 60]
        if weak:
            weak_summary = "Weak topics: " + ", ".join(
                f"{t['name']} ({t['confidence_score']:.0f}%)" for t in weak
            )

    context_prompt = f"""
[PAST SESSIONS — semantic recall]
{memory_context}

[RECENT CONVERSATION]
{history_text}

[STUDENT CONTEXT]
Active subject: {subject_name or "None"}
{weak_summary}

[STUDENT MESSAGE]
{user_message}
"""

    # ── 3. First LLM call — Reason + decide action ───────────
    messages = [
        {"role": "system",  "content": REACT_SYSTEM},
        {"role": "user",    "content": context_prompt},
    ]

    first_response = ollama.chat(
        model=settings.ollama_model,
        messages=messages,
        options={"temperature": settings.ollama_temperature},
    )
    raw = first_response["message"]["content"]

    # ── 4. Parse ACTION / ARGS ────────────────────────────────
    action_match = re.search(r"ACTION:\s*(\w+)", raw)
    args_match   = re.search(r"ARGS:\s*(\{.*?\}|\[.*?\])", raw, re.DOTALL)

    if action_match:
        tool_name = action_match.group(1).strip()
        tool_fn   = TOOLS.get(tool_name)

        if tool_fn:
            # Parse args
            args: dict = {}
            if args_match:
                try:
                    args = json.loads(args_match.group(1))
                except json.JSONDecodeError:
                    args = {}

            # ── 5. Execute tool ───────────────────────────────
            try:
                observation = tool_fn(**args) if isinstance(args, dict) else tool_fn(*args)
            except Exception as e:
                observation = f"Tool error: {e}"

            # ── 6. Second LLM call — synthesize observation ───
            obs_str = (
                json.dumps(observation, indent=2)
                if not isinstance(observation, str)
                else observation
            )

            messages.append({"role": "assistant", "content": raw})
            messages.append({
                "role": "user",
                "content": f"[TOOL RESULT — {tool_name}]\n{obs_str}\n\nNow respond to the student using this result.",
            })

            final = ollama.chat(
                model=settings.ollama_model,
                messages=messages,
                options={"temperature": settings.ollama_temperature},
                stream=True,
            )

            full_response = ""
            for chunk in final:
                token = chunk["message"]["content"]
                full_response += token
                yield token

            # If tool returned structured data (quiz/flashcards), also yield it
            if isinstance(observation, (list, dict)):
                yield f"\n\n__TOOL_DATA__:{json.dumps(observation)}"

        else:
            # Unknown tool — fall back to direct response
            yield raw
    else:
        # ── Direct response (no tool needed) — stream it ─────
        messages_stream = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": context_prompt},
        ]
        stream = ollama.chat(
            model=settings.ollama_model,
            messages=messages_stream,
            options={"temperature": settings.ollama_temperature},
            stream=True,
        )
        for chunk in stream:
            token = chunk["message"]["content"]
            yield token
