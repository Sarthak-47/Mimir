"""
Mimir — Background Scheduler Jobs
Uses APScheduler AsyncIOScheduler (no separate thread, runs on the event loop).

Jobs:
  review_check  — every hour  — logs topics whose next_review is past due
  streak_update — every day   — recomputes study streaks for all active users
"""

import logging
from collections import defaultdict
from datetime import datetime, date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from memory.database import AsyncSessionLocal, Topic, QuizSession, User
from ws_manager import manager

logger = logging.getLogger("mimir.scheduler")


# ── Helpers ──────────────────────────────────────────────────

def compute_streak(session_dates: list[date]) -> int:
    """Return the length of the current consecutive-day study streak.

    Args:
        session_dates: Dates (possibly with duplicates) on which the user had
            quiz activity. Order does not matter.

    Returns:
        Number of consecutive days ending today (or yesterday) with activity.
        Returns 0 if there is no activity or if the most recent session was
        more than one day ago.
    """
    if not session_dates:
        return 0

    today = date.today()
    unique = sorted(set(session_dates), reverse=True)

    # If most recent activity was more than 1 day ago, streak is broken
    if unique[0] < today - timedelta(days=1):
        return 0

    streak = 0
    expected = today
    for d in unique:
        if d == expected or d == expected - timedelta(days=1):
            streak += 1
            expected = d - timedelta(days=1)
        elif d < expected:
            break  # gap found

    return streak


# ── Jobs ─────────────────────────────────────────────────────

async def review_check() -> None:
    """Hourly job: push WebSocket review reminders for overdue topics.

    Queries all topics whose ``next_review`` timestamp is in the past, groups
    them by ``user_id``, and sends a ``review_reminder`` WebSocket message to
    each user who is currently connected. Capped at 5 topic names per message
    to keep the payload small.
    """
    now = datetime.utcnow()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Topic).where(
                Topic.next_review.isnot(None),
                Topic.next_review <= now,
            )
        )
        overdue = result.scalars().all()

    if overdue:
        # Group by user and send a WS push to each connected user
        by_user: dict[int, list[str]] = defaultdict(list)
        for t in overdue:
            by_user[t.user_id].append(t.name)

        for uid, topic_names in by_user.items():
            await manager.send_to_user(uid, {
                "type":   "review_reminder",
                "topics": topic_names[:5],
                "count":  len(topic_names),
            })

        logger.info(
            "[review_check] %d topic(s) overdue — notified %d user(s)",
            len(overdue), len(by_user),
        )
    else:
        logger.debug("[review_check] No topics overdue.")


async def streak_update() -> None:
    """Daily job: recompute study streaks for all users with quiz history.

    Iterates every user who has at least one ``QuizSession`` and logs their
    current streak. The authoritative streak is also computed live in the
    ``/api/progress/stats`` endpoint; this job exists as a hook for future
    caching or push notifications.
    """
    async with AsyncSessionLocal() as db:
        # Get distinct user IDs that have at least one quiz session
        result = await db.execute(
            select(QuizSession.user_id).distinct()
        )
        user_ids = [row[0] for row in result.fetchall()]

        for uid in user_ids:
            sessions = await db.execute(
                select(QuizSession.timestamp)
                .where(QuizSession.user_id == uid)
                .order_by(QuizSession.timestamp.desc())
            )
            dates = [s[0].date() for s in sessions.fetchall()]
            streak = compute_streak(dates)
            logger.info("[streak_update] user %d — streak: %d day(s)", uid, streak)
