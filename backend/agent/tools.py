"""
Mimir — Agent Tools
Each tool takes structured input and returns structured output.
Tools are called by the ReAct loop when the LLM selects an action.
"""

import json
import re
from datetime import datetime, timedelta
from typing import Any

import ollama

from config import settings
from agent.prompts import (
    EXPLAIN_PROMPT, QUIZ_PROMPT, SUMMARIZE_PROMPT,
    FLASHCARD_PROMPT, SCHEDULE_PROMPT,
)


# ── Ollama helper ────────────────────────────────────────────

def _llm(prompt: str, system: str = "") -> str:
    """Call the local Ollama model synchronously and return the response text.

    Intended for use inside ``asyncio.to_thread`` so it does not block the
    FastAPI event loop.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = ollama.chat(
        model=settings.ollama_model,
        messages=messages,
        options={"temperature": settings.ollama_temperature},
        think=False,
    )
    return response["message"]["content"]


def _parse_json(text: str) -> Any:
    """Extract and parse the first complete JSON object or array from LLM output.

    Tries three strategies in order:
    1. Direct ``json.loads`` on the stripped text (fast path for clean output).
    2. Depth-aware bracket scan to find the first balanced ``[…]`` or ``{…}`` block.
    3. Greedy regex as a last resort.

    Raises ``json.JSONDecodeError`` if all strategies fail.
    """
    # Fast path: the model returned clean JSON directly
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Depth-aware extraction: find the first complete [...] or {...} block
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start = stripped.find(open_ch)
        if start == -1:
            continue
        depth = 0
        for i, ch in enumerate(stripped[start:], start):
            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(stripped[start : i + 1])
                    except json.JSONDecodeError:
                        break

    # Last resort: greedy regex (handles text with preamble/postamble)
    match = re.search(r"(\[.*\]|\{.*\})", stripped, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(stripped)


# ── Tool: explain ────────────────────────────────────────────

def tool_explain(concept: str, depth: str = "intermediate") -> str:
    """
    Explain a concept at the requested depth.
    depth: 'beginner' | 'intermediate' | 'advanced'
    Returns: Markdown string.
    """
    prompt = EXPLAIN_PROMPT.format(concept=concept, depth=depth)
    return _llm(prompt)


# ── Tool: quiz ───────────────────────────────────────────────

def tool_quiz(topic: str, subject: str = "", n: int = 5, difficulty: str = "medium") -> list[dict]:
    """
    Generate n MCQ questions about a topic at the given difficulty.

    Args:
        topic:      The concept to quiz on.
        subject:    Broader subject context (optional).
        n:          Number of questions to generate.
        difficulty: One of ``"easy" | "medium" | "hard" | "expert"``.

    Returns:
        list of {question, options, answer (int), explanation}
    """
    valid_difficulties = {"easy", "medium", "hard", "expert"}
    if difficulty not in valid_difficulties:
        difficulty = "medium"
    try:
        prompt = QUIZ_PROMPT.format(topic=topic, subject=subject, n=n, difficulty=difficulty)
        raw = _llm(prompt)
        questions = _parse_json(raw)
        return questions
    except Exception:
        return []


# ── Tool: summarize ──────────────────────────────────────────

def tool_summarize(content: str) -> str:
    """
    Summarize raw text (e.g., from a PDF) into study notes.
    Returns: Markdown string.
    """
    prompt = SUMMARIZE_PROMPT.format(content=content[:8000])  # cap to context window
    return _llm(prompt)


# ── Tool: flashcards ─────────────────────────────────────────

def tool_flashcards(topic: str, n: int = 10) -> list[dict]:
    """
    Generate n Q&A flashcard pairs on a topic.
    Returns: list of {front, back}
    """
    prompt = FLASHCARD_PROMPT.format(topic=topic, n=n)
    raw = _llm(prompt)
    try:
        return _parse_json(raw)
    except (json.JSONDecodeError, AttributeError):
        return []


# ── Tool: schedule ───────────────────────────────────────────

def tool_schedule(
    subject: str,
    topics: list[str],
    days_until_exam: int,
    weak_topics: list[str],
) -> str:
    """
    Build a day-by-day revision schedule.
    Returns: Markdown plan.
    """
    prompt = SCHEDULE_PROMPT.format(
        subject=subject,
        topics=", ".join(topics),
        days=days_until_exam,
        weak_topics=", ".join(weak_topics) if weak_topics else "none identified yet",
    )
    return _llm(prompt)


# ── Tool: recall ─────────────────────────────────────────────

def tool_recall(past_messages: list[dict]) -> str:
    """
    Summarize what the user has studied in past sessions.
    past_messages: list of {role, content}
    Returns: brief summary string.
    """
    if not past_messages:
        return "No past sessions found."

    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content'][:200]}"
        for m in past_messages[:20]
    )
    prompt = f"Briefly summarize what topics this student has been studying:\n\n{history_text}"
    return _llm(prompt)


# ── Tool: weak_topics ────────────────────────────────────────

def tool_weak_topics(topic_scores: list[dict]) -> list[dict]:
    """
    Given a list of {topic, confidence_score}, return topics sorted by score (ascending).
    Scores below 60 are considered weak.
    Returns: [{"topic": str, "score": float, "status": str}]
    """
    if not topic_scores:
        return []

    sorted_topics = sorted(topic_scores, key=lambda t: t.get("confidence_score", 0))

    result = []
    for t in sorted_topics:
        score = t.get("confidence_score", 0)
        status = (
            "critical" if score < 40 else
            "weak"     if score < 60 else
            "moderate" if score < 80 else
            "strong"
        )
        result.append({
            "topic": t.get("name", "Unknown"),
            "score": round(score, 1),
            "status": status,
        })
    return result


# ── Spaced Repetition (SM-2) ─────────────────────────────────

def compute_sm2(
    score: int,
    total: int,
    ease_factor: float = 2.5,
    repetitions: int = 0,
    interval: int = 1,
) -> tuple[float, int, int, datetime]:
    """Full SM-2 spaced-repetition algorithm.

    Maps the quiz percentage to a quality rating (0–5), then applies the
    standard SM-2 update rules for ease factor, repetition count, and
    inter-repetition interval.

    Quality mapping:
        90%+  → 5 (perfect)     80–89% → 4     70–79% → 3 (pass threshold)
        60–69% → 2 (fail)       40–59% → 1      <40%  → 0 (complete fail)

    Args:
        score:       Number of correct answers.
        total:       Total number of questions.
        ease_factor: Current ease factor for the topic (default 2.5).
        repetitions: Number of consecutive successful reviews (default 0).
        interval:    Current inter-repetition interval in days (default 1).

    Returns:
        ``(new_ease_factor, new_repetitions, new_interval, next_review_datetime)``
    """
    pct = (score / total * 100) if total > 0 else 0

    # Map percentage to SM-2 quality (0–5)
    if pct >= 90:
        quality = 5
    elif pct >= 80:
        quality = 4
    elif pct >= 70:
        quality = 3
    elif pct >= 60:
        quality = 2   # borderline fail
    elif pct >= 40:
        quality = 1
    else:
        quality = 0

    if quality >= 3:
        # Successful recall — advance the schedule
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)

        # SM-2 ease factor update (min 1.3)
        new_ease = ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        new_ease = max(1.3, round(new_ease, 3))
        new_reps = repetitions + 1
    else:
        # Failed recall — reset repetitions and shorten interval
        new_interval = 1
        new_reps = 0
        new_ease = max(1.3, round(ease_factor - 0.2, 3))

    # Cap at 365 days to stay practical
    new_interval = min(new_interval, 365)

    next_review = datetime.utcnow() + timedelta(days=new_interval)
    return new_ease, new_reps, new_interval, next_review


def compute_next_review(score: int, total: int) -> datetime:
    """Legacy wrapper — returns only the next_review datetime using SM-2 defaults.

    Kept for any callers that only need the datetime and don't track SM-2 state.
    """
    _, _, _, next_review = compute_sm2(score, total)
    return next_review
