"""
Mimir — Interactive Tutor Session State Machine.

Five-stage structured lesson flow. Each stage has a dedicated system prompt
and advances automatically after the LLM responds. The QUIZ stage generates
JSON (non-streaming) which is sent as a ``__TUTOR_QUIZ__`` signal. All other
stages stream text with a ``__TUTOR_STATE__:{state}`` signal prepended so the
frontend can animate the progress chain.

States (Norse names in parentheses):
  INTRO   (The Summoning  ᚢ) — greet, scope the topic, ask what student knows
  TEACH   (The Wisdom     ᛞ) — core explanation with analogy, mechanics, example
  CHECK   (Trial of Words ᚾ) — one open question to verify understanding
  QUIZ    (Trial of Blades ᛏ) — 3 MCQ JSON generation (non-streaming)
  DEBRIEF (The Saga       ᛟ) — review quiz result, key takeaways, encourage
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator

import ollama

from config import settings

logger = logging.getLogger("mimir.tutor")

# State progression
STATES = ["INTRO", "TEACH", "CHECK", "QUIZ", "DEBRIEF"]

def next_state(current: str) -> str | None:
    """Return the next state after ``current``, or None if at DEBRIEF."""
    try:
        idx = STATES.index(current)
    except ValueError:
        return None
    if idx >= len(STATES) - 1:
        return None
    return STATES[idx + 1]


# ── Per-state system prompts ─────────────────────────────────

_COMMON_FOOTER = (
    "Do not use markdown formatting. No headers, bullet points, or bold text. "
    "Write in plain paragraphs. No emojis."
)

_PROMPTS: dict[str, str] = {
    "INTRO": (
        "You are Mimir, beginning a structured tutor session. This is the Summoning — "
        "your first contact with the student on this topic. "
        "Greet them briefly (one sentence), name the topic you will cover today, "
        "and ask exactly one question: what do they already know about it? "
        "Be warm but brief. Do not begin teaching yet. "
        + _COMMON_FOOTER
    ),
    "TEACH": (
        "You are Mimir, delivering the core teaching — the Wisdom. "
        "Explain the topic thoroughly in prose. "
        "Follow this structure: begin with a concrete analogy that anchors the concept, "
        "then cover the mechanics and formal details, then walk through a worked example. "
        "Write at least three paragraphs. Do not skim. Do not ask questions yet. "
        + _COMMON_FOOTER
    ),
    "CHECK": (
        "You are Mimir, conducting the Trial of Words — a comprehension check. "
        "Ask the student exactly one open-ended question that tests genuine understanding "
        "of what was just explained. The question should require reasoning, not recall. "
        "Do not explain anything new. Do not offer hints. One question only, then stop. "
        + _COMMON_FOOTER
    ),
    "QUIZ": (
        "You are Mimir, generating the Trial of Blades — a short quiz. "
        "Generate exactly 3 multiple-choice questions about the topic. "
        "Output ONLY valid JSON — no prose, no preamble, no markdown fences. "
        "Format:\n"
        '[\n'
        '  {"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], '
        '"answer": 0, "explanation": "..."}\n'
        "]\n"
        'Where "answer" is the 0-based index of the correct option.'
    ),
    "DEBRIEF": (
        "You are Mimir, delivering the Saga — the closing debrief of this lesson. "
        "You have just received the student's quiz results (score and any errors). "
        "Acknowledge their score with genuine warmth. "
        "Review the one or two concepts they found hardest. "
        "Name the single most important thing to remember from today's session. "
        "Close with a brief encouraging word. Keep it to two or three paragraphs. "
        + _COMMON_FOOTER
    ),
}


# ── Streaming generator ──────────────────────────────────────

_client = ollama.AsyncClient(host=settings.ollama_base_url)


async def run_tutor_turn(
    state: str,
    topic_name: str,
    history: list[dict],
    quiz_result: dict | None = None,
) -> AsyncIterator[str]:
    """Stream one tutor turn for the given state.

    Yields:
      - ``__TUTOR_STATE__:{state}`` as first chunk (frontend signal)
      - For QUIZ: ``__TUTOR_QUIZ__:{json}`` (no streaming tokens)
      - For all others: streaming text tokens
    """
    yield f"__TUTOR_STATE__:{state}"

    system_prompt = _PROMPTS.get(state, _PROMPTS["TEACH"])

    # Build the messages list
    messages = [{"role": "system", "content": system_prompt}]

    # Inject a context note at the top of history
    context_note = f"[TUTOR SESSION — topic: {topic_name!r}, stage: {state}]"
    if history:
        messages.append({"role": "user", "content": context_note})
        messages.append({"role": "assistant", "content": "Understood."})

    # Inject quiz results into DEBRIEF context
    if state == "DEBRIEF" and quiz_result:
        score = quiz_result.get("score", 0)
        total = quiz_result.get("total", 3)
        wrong = quiz_result.get("wrong_topics", [])
        debrief_ctx = (
            f"The student scored {score}/{total} on the quiz. "
            + (f"They struggled with: {', '.join(wrong)}." if wrong else "They answered all correctly.")
        )
        messages.append({"role": "user", "content": debrief_ctx})
        messages.append({"role": "assistant", "content": "I'll tailor my debrief to those results."})

    messages.extend(history[-10:])  # last 10 turns of tutor conversation

    if state == "QUIZ":
        # Non-streaming: collect full JSON then emit as signal
        try:
            resp = await _client.chat(
                model=settings.ollama_model,
                messages=messages,
                stream=False,
                options={"temperature": 0.4},
            )
            raw = resp["message"]["content"].strip()
            # Strip markdown fences if model adds them
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
            # Validate JSON
            parsed = json.loads(raw)
            yield f"__TUTOR_QUIZ__:{json.dumps(parsed)}"
        except Exception as exc:
            logger.error("QUIZ generation failed: %s", exc)
            # Fallback: single placeholder question
            fallback = [{"question": f"Describe the key idea of {topic_name}.",
                         "options": ["A. Option A", "B. Option B", "C. Option C", "D. Option D"],
                         "answer": 0, "explanation": "Open-ended review."}]
            yield f"__TUTOR_QUIZ__:{json.dumps(fallback)}"
        return

    # Streaming for all other states
    try:
        async for chunk in await _client.chat(
            model=settings.ollama_model,
            messages=messages,
            stream=True,
            options={"temperature": 0.6},
        ):
            token = chunk["message"]["content"]
            if token:
                yield token
    except Exception as exc:
        logger.error("Tutor streaming error (%s): %s", state, exc)
        yield f"\n[Tutor error in {state}: {exc}]"
