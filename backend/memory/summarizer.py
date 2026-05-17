"""
Mimir — Long-Term Memory Summarisation.

Daily scheduler job that compresses old conversation turns (> 7 days) into
session-level ChromaDB summary documents, keeping retrieval quality high as
history grows. Individual turns are replaced by a single concise summary so
the vector index stays lean and semantically clean.

Session definition: a group of consecutive turns with no gap > 2 hours.
Only sessions with 5 or more turns are summarised (tiny sessions are cheap
to keep as-is).
"""

import asyncio
import logging
from datetime import datetime, timedelta

import ollama
from sqlalchemy import select

from config import settings
from memory.database import AsyncSessionLocal, Conversation
from memory.vector import get_collection

logger = logging.getLogger("mimir.summarizer")

# ── Configuration ─────────────────────────────────────────────
_OLDER_THAN_DAYS    = 7     # only touch sessions older than this
_SESSION_GAP_HOURS  = 2     # gap (hours) that defines a new session boundary
_MIN_TURNS          = 5     # sessions with fewer turns are left as-is


# ── Helpers ───────────────────────────────────────────────────

def _split_sessions(convs: list) -> list[list]:
    """Partition conversation turns into sessions separated by > _SESSION_GAP_HOURS."""
    if not convs:
        return []
    sessions: list[list] = [[convs[0]]]
    for c in convs[1:]:
        gap = c.timestamp - sessions[-1][-1].timestamp
        if gap > timedelta(hours=_SESSION_GAP_HOURS):
            sessions.append([c])
        else:
            sessions[-1].append(c)
    return sessions


async def _ollama_summarise(turns_text: str, date_str: str) -> str:
    """Call Ollama to produce a 2-3 sentence session summary."""
    prompt = (
        f"Summarise this study session from {date_str} in 2-3 concise sentences. "
        "Focus on the concepts discussed and any key insights or questions raised.\n\n"
        + turns_text
    )
    try:
        response = await asyncio.to_thread(
            lambda: ollama.chat(
                model=settings.ollama_model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": 0.2, "num_predict": 180},
                think=False,
            )
        )
        return response["message"]["content"].strip()
    except Exception as exc:
        logger.warning("[summarizer] Ollama failed: %s", exc)
        return ""


async def _process_session(user_id: int, session: list) -> None:
    """Summarise one session: store summary in ChromaDB, delete old entries, mark SQLite."""
    date_str   = session[0].timestamp.strftime("%Y-%m-%d")
    subject_id = next((c.subject_id for c in session if c.subject_id), None)
    conv_ids   = [c.id for c in session]

    # Build a compact text representation of the session (cap per turn at 200 chars)
    turns_text = "\n".join(
        f"{c.role.upper()}: {c.content[:200]}" for c in session
    )

    summary = await _ollama_summarise(turns_text, date_str)
    if not summary:
        # Fallback: headline concatenation if Ollama is unavailable
        summary = " | ".join(c.content[:60] for c in session[:3])
    summary = f"[Session {date_str}] {summary}"

    # ── Upsert summary into ChromaDB ────────────────────────
    collection = get_collection()
    summary_id = f"u{user_id}-summary-{session[0].id}"
    meta: dict = {"user_id": str(user_id), "role": "summary"}
    if subject_id is not None:
        meta["subject_id"] = str(subject_id)
    try:
        collection.upsert(
            ids=[summary_id],
            documents=[summary],
            metadatas=[meta],
        )
    except Exception as exc:
        logger.error("[summarizer] ChromaDB upsert failed: %s", exc)
        return

    # ── Delete replaced individual entries ───────────────────
    old_ids = [f"u{user_id}-c{cid}" for cid in conv_ids]
    try:
        collection.delete(ids=old_ids)
    except Exception as exc:
        logger.warning("[summarizer] ChromaDB delete failed: %s", exc)

    # ── Mark rows as summarised in SQLite ────────────────────
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Conversation).where(Conversation.id.in_(conv_ids))
        )
        for row in result.scalars().all():
            row.summarized = True
        await db.commit()

    logger.info(
        "[summarizer] user=%d session=%s summarised (%d turns → 1 doc)",
        user_id, date_str, len(session),
    )


# ── Public job ────────────────────────────────────────────────

async def summarize_old_sessions() -> None:
    """APScheduler entry point — compress sessions older than _OLDER_THAN_DAYS days.

    Runs at 02:00 UTC daily (registered in ``main.py``).
    Safe to skip: already-summarised turns are excluded via the ``summarized``
    column; restarting the job is idempotent.
    """
    cutoff = datetime.utcnow() - timedelta(days=_OLDER_THAN_DAYS)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.timestamp < cutoff,
                Conversation.summarized == False,  # noqa: E712
            )
            .order_by(Conversation.user_id, Conversation.timestamp)
        )
        old_convs = result.scalars().all()

    if not old_convs:
        logger.debug("[summarizer] Nothing to summarise.")
        return

    # Group by user
    by_user: dict[int, list] = {}
    for c in old_convs:
        by_user.setdefault(c.user_id, []).append(c)

    total_sessions = 0
    for user_id, convs in by_user.items():
        for session in _split_sessions(convs):
            if len(session) >= _MIN_TURNS:
                await _process_session(user_id, session)
                total_sessions += 1

    logger.info(
        "[summarizer] Done — %d session(s) summarised across %d user(s).",
        total_sessions, len(by_user),
    )
