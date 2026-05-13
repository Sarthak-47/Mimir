"""
Mimir — Background Scheduler Jobs
Uses APScheduler AsyncIOScheduler (no separate thread, runs on the event loop).

Jobs:
  review_check  — every hour  — logs topics whose next_review is past due
  streak_update — every day   — recomputes study streaks for all active users
"""

import logging
from datetime import datetime, date, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from memory.database import AsyncSessionLocal, Topic, QuizSession, User

logger = logging.getLogger("mimir.scheduler")


# ── Helpers ──────────────────────────────────────────────────

def compute_streak(session_dates: list[date]) -> int:
    """
    Given a sorted list of unique dates on which the user studied,
    return the length of the current consecutive-day streak ending today.
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
    """
    Hourly: find topics past their next_review date.
    Currently logs a summary; future work — push WS notification to
    connected clients.
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
        logger.info(
            "[review_check] %d topic(s) overdue for review: %s",
            len(overdue),
            [t.name for t in overdue[:5]],  # log first 5
        )
    else:
        logger.debug("[review_check] No topics overdue.")


async def streak_update() -> None:
    """
    Daily: recompute and log streak lengths for every user who has had
    quiz activity. Streak computation is kept live in the /stats endpoint
    for accuracy, but this job can be extended to cache or notify.
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
