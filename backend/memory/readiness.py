"""
Mimir — Study Readiness Engine

Computes per-topic readiness scores using the Ebbinghaus forgetting curve
and generates a 7-day study schedule optimised for an upcoming exam.

Algorithm
---------
1. Ebbinghaus decay: readiness = base_confidence × e^(-t / stability)
   where `stability` (days) depends on confidence tier.
2. Recency-weighted blend: if quiz history exists, the last 3 quiz scores
   count 2× more than older scores; blended 60/40 with the decayed score.
3. Schedule: topics are ranked by urgency = (100 - readiness) × time_pressure,
   then distributed across the next 7 days in a rotating slot system.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Optional

from memory.database import Topic, QuizSession


# ── Tuneable constants ───────────────────────────────────────
# Ebbinghaus stability: days before retention drops to e^-1 ≈ 37 %.
_STABILITY = {
    "strong":   21.0,   # confidence ≥ 80 %
    "good":     10.0,   # confidence ≥ 60 %
    "moderate":  5.0,   # confidence ≥ 40 %
    "weak":      2.0,   # confidence < 40 %
}

_RECENCY_WEIGHT = 2.0   # weight multiplier for the `_RECENCY_N` most recent sessions
_RECENCY_N      = 3     # number of "recent" quiz sessions
_BLEND_DECAY    = 0.60  # fraction of Ebbinghaus-decayed score in the blend
_BLEND_QUIZ     = 0.40  # fraction of recency-weighted quiz average


# ── Internal helpers ─────────────────────────────────────────

def _stability_for(confidence: float) -> float:
    """Return the Ebbinghaus stability constant (days) for a confidence tier."""
    if confidence >= 80:
        return _STABILITY["strong"]
    elif confidence >= 60:
        return _STABILITY["good"]
    elif confidence >= 40:
        return _STABILITY["moderate"]
    return _STABILITY["weak"]


def _ebbinghaus(base: float, days_elapsed: float, stability: float) -> float:
    """Apply Ebbinghaus forgetting: R(t) = base × e^(-t / stability). Returns 0–100."""
    if days_elapsed <= 0:
        return base
    return base * math.exp(-days_elapsed / stability)


def _recency_weighted_avg(sessions: list[QuizSession]) -> Optional[float]:
    """
    Recency-weighted quiz average.

    The `_RECENCY_N` most-recent sessions are weighted `_RECENCY_WEIGHT×` more
    than older ones.  Returns ``None`` when the list is empty.
    """
    if not sessions:
        return None

    ordered = sorted(sessions, key=lambda s: s.timestamp, reverse=True)
    weight_sum = 0.0
    score_sum  = 0.0

    for i, s in enumerate(ordered):
        pct    = (s.score / s.total * 100.0) if s.total > 0 else 0.0
        weight = _RECENCY_WEIGHT if i < _RECENCY_N else 1.0
        score_sum  += pct * weight
        weight_sum += weight

    return score_sum / weight_sum if weight_sum > 0 else None


# ── Public API ───────────────────────────────────────────────

def calculate_topic_readiness(
    topic: Topic,
    sessions: list[QuizSession],
    now: datetime | None = None,
) -> float:
    """
    Compute a readiness score (0–100) for one topic.

    Combines:
    - Ebbinghaus-decayed confidence score (primary signal, 60 %)
    - Recency-weighted quiz average (supplementary signal, 40 %; omitted when
      no quiz history exists)

    Args:
        topic:    Topic ORM object — needs ``confidence_score`` and ``last_studied``.
        sessions: All ``QuizSession`` records belonging to this topic.
        now:      Override for the current time (handy for unit tests).

    Returns:
        Float in [0, 100].
    """
    now  = now or datetime.utcnow()
    base = topic.confidence_score  # 0–100

    # 1. Apply Ebbinghaus decay
    if topic.last_studied:
        days_elapsed = (now - topic.last_studied).total_seconds() / 86400.0
        stab         = _stability_for(base)
        decayed      = _ebbinghaus(base, days_elapsed, stab)
    else:
        decayed = base  # never studied → no decay to apply

    # 2. Blend with recency-weighted quiz average
    quiz_avg = _recency_weighted_avg(sessions)
    if quiz_avg is not None:
        readiness = _BLEND_DECAY * decayed + _BLEND_QUIZ * quiz_avg
    else:
        readiness = decayed

    return max(0.0, min(100.0, readiness))


def decay_days(topic: Topic, now: datetime | None = None) -> float:
    """Return how many days have elapsed since this topic was last studied (0 if never)."""
    now = now or datetime.utcnow()
    if topic.last_studied is None:
        return 0.0
    return (now - topic.last_studied).total_seconds() / 86400.0


def priority_label(readiness: float) -> str:
    """Map a readiness score to a human-readable priority string."""
    if readiness < 40:
        return "critical"
    if readiness < 60:
        return "weak"
    if readiness < 80:
        return "moderate"
    return "strong"


def _urgency(readiness: float, days_to_exam: int | None) -> float:
    """
    Scheduling urgency score (higher = review sooner).

    Combines:
    - Gap from 100 % (the weaker the topic, the higher the urgency)
    - Time pressure from exam proximity (ramps from ×1.0 at 30+ days to ×2.5 at 1 day)
    """
    gap = (100.0 - readiness) / 100.0  # 0–1, higher is worse

    if days_to_exam is None or days_to_exam <= 0:
        return gap

    # Smooth ramp: at 1 day → factor ≈ 2.5; at 30+ days → factor ≈ 1.0
    time_factor = max(1.0, 2.5 - max(0, days_to_exam - 1) * (1.5 / 29))
    return gap * time_factor


def generate_schedule(
    topics_with_readiness: list[dict],
    exam_date: datetime | None = None,
    days: int = 7,
    slots_per_day: int = 3,
    now: datetime | None = None,
) -> list[dict]:
    """
    Generate a 7-day study schedule.

    Topics are ranked by urgency and distributed across days in a rotating
    window so each day gets fresh recommendations while the weakest topics
    appear most often.

    Args:
        topics_with_readiness: List of dicts with keys
            ``name``, ``subject_name``, ``readiness``.
        exam_date: Optional upcoming exam; drives time-pressure weighting.
        days: Number of days to project (default 7).
        slots_per_day: Max topics recommended per day (default 3).
        now: Override for "today" (useful in tests).

    Returns:
        List of day-dicts::

            [
              {
                "date":      "2026-05-18",
                "day_label": "Tomorrow",        # or weekday name
                "days_until_exam": 14,          # None if no exam date
                "topics": [
                  {
                    "name":      "Sorting Algorithms",
                    "subject":   "Data Structures",
                    "readiness": 42.1,
                    "priority":  "critical",
                  },
                  ...
                ]
              },
              ...
            ]
    """
    now = now or datetime.utcnow()

    days_to_exam: int | None = None
    if exam_date is not None:
        days_to_exam = (exam_date.date() - now.date()).days

    # Rank all topics by urgency
    scored = sorted(
        [
            {**t, "urgency": _urgency(t["readiness"], days_to_exam)}
            for t in topics_with_readiness
        ],
        key=lambda x: x["urgency"],
        reverse=True,
    )

    n = len(scored)
    schedule: list[dict] = []

    for offset in range(days):
        date = now.date() + timedelta(days=offset + 1)

        if offset == 0:
            day_label = "Tomorrow"
        elif offset == 1:
            day_label = "In 2 days"
        else:
            day_label = date.strftime("%A")   # Monday, Tuesday, …

        days_until_exam = (days_to_exam - (offset + 1)) if days_to_exam is not None else None

        # Rotate starting index so each day highlights different topics first
        slot_topics: list[dict] = []
        for i in range(slots_per_day):
            if n == 0:
                break
            idx = ((offset * slots_per_day) + i) % n
            t   = scored[idx]
            slot_topics.append({
                "name":      t["name"],
                "subject":   t["subject_name"],
                "readiness": round(t["readiness"], 1),
                "priority":  priority_label(t["readiness"]),
            })

        schedule.append({
            "date":            date.isoformat(),
            "day_label":       day_label,
            "days_until_exam": days_until_exam,
            "topics":          slot_topics,
        })

    return schedule
