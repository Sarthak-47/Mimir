"""
Mimir — Tutor Session REST Router.

Endpoints:
  POST /api/tutor/sessions
      Create a new tutor session for a topic. Returns {id, state, topic_name}.

  GET  /api/tutor/sessions/{session_id}
      Fetch the current state of a session.

  POST /api/tutor/sessions/{session_id}/advance
      Advance the session to the next state (called by chat.py after each turn).
      Body: {quiz_score?: int, quiz_total?: int, wrong_topics?: list[str]}

  GET  /api/tutor/sessions
      List all sessions for the authenticated user (most recent first, limit 20).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from memory.database import TutorSession, get_db
from routers.users import get_current_user

router = APIRouter()


# ── Pydantic models ──────────────────────────────────────────

class SessionCreate(BaseModel):
    topic_name: str
    subject_id: int | None = None


class SessionAdvance(BaseModel):
    quiz_score:  int | None = None
    quiz_total:  int | None = None
    wrong_topics: list[str] = []


class SessionOut(BaseModel):
    id:           int
    topic_name:   str
    subject_id:   int | None
    state:        str
    quiz_score:   int | None
    quiz_total:   int | None
    created_at:   str
    completed_at: str | None

    model_config = {"from_attributes": True}


# ── Helpers ──────────────────────────────────────────────────

_STATES = ["INTRO", "TEACH", "CHECK", "QUIZ", "DEBRIEF"]


def _next(state: str) -> str | None:
    """Return the state that follows ``state`` in the tutor pipeline.

    Returns ``None`` when ``state`` is already ``"DEBRIEF"`` (terminal) or
    is not a recognised state name.
    """
    try:
        idx = _STATES.index(state)
    except ValueError:
        return None
    return _STATES[idx + 1] if idx < len(_STATES) - 1 else None


def _fmt(dt: datetime | None) -> str | None:
    """Format a datetime as an ISO-8601 string, or return ``None`` if absent."""
    return dt.isoformat() if dt else None


# ── Endpoints ────────────────────────────────────────────────

@router.post("/sessions", response_model=SessionOut)
async def create_session(
    body: SessionCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new tutor session for the given topic and return its initial state.

    The session starts in the ``INTRO`` state. The client should immediately
    begin the first tutor turn by sending a chat message that includes the
    returned ``id`` as ``tutor_session_id``.
    """
    session = TutorSession(
        user_id=user.id,
        topic_name=body.topic_name.strip(),
        subject_id=body.subject_id,
        state="INTRO",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionOut(
        id=session.id,
        topic_name=session.topic_name,
        subject_id=session.subject_id,
        state=session.state,
        quiz_score=session.quiz_score,
        quiz_total=session.quiz_total,
        created_at=_fmt(session.created_at),
        completed_at=_fmt(session.completed_at),
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Return the 20 most recent tutor sessions for the authenticated user, newest first."""
    result = await db.execute(
        select(TutorSession)
        .where(TutorSession.user_id == user.id)
        .order_by(TutorSession.created_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    return [
        SessionOut(
            id=r.id,
            topic_name=r.topic_name,
            subject_id=r.subject_id,
            state=r.state,
            quiz_score=r.quiz_score,
            quiz_total=r.quiz_total,
            created_at=_fmt(r.created_at),
            completed_at=_fmt(r.completed_at),
        )
        for r in rows
    ]


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Fetch a single tutor session by ID. Raises 404 if not found or not owned by the user."""
    result = await db.execute(
        select(TutorSession).where(
            TutorSession.id == session_id,
            TutorSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Tutor session not found.")
    return SessionOut(
        id=session.id,
        topic_name=session.topic_name,
        subject_id=session.subject_id,
        state=session.state,
        quiz_score=session.quiz_score,
        quiz_total=session.quiz_total,
        created_at=_fmt(session.created_at),
        completed_at=_fmt(session.completed_at),
    )


@router.post("/sessions/{session_id}/advance", response_model=SessionOut)
async def advance_session(
    session_id: int,
    body: SessionAdvance,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Advance a tutor session to its next state and persist any quiz scores.

    Called by ``chat.py`` after the agent completes each stage of the lesson.
    Accepts optional ``quiz_score`` / ``quiz_total`` which are stored on the
    session row for progress tracking.  Raises 400 if the session is already
    in the terminal ``DEBRIEF`` state, 404 if not found.
    """
    result = await db.execute(
        select(TutorSession).where(
            TutorSession.id == session_id,
            TutorSession.user_id == user.id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Tutor session not found.")
    if session.state == "DEBRIEF":
        raise HTTPException(status_code=400, detail="Session is already complete.")

    if body.quiz_score is not None:
        session.quiz_score = body.quiz_score
    if body.quiz_total is not None:
        session.quiz_total = body.quiz_total

    new_state = _next(session.state)
    if new_state:
        session.state = new_state
        if new_state == "DEBRIEF":
            session.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(session)
    return SessionOut(
        id=session.id,
        topic_name=session.topic_name,
        subject_id=session.subject_id,
        state=session.state,
        quiz_score=session.quiz_score,
        quiz_total=session.quiz_total,
        created_at=_fmt(session.created_at),
        completed_at=_fmt(session.completed_at),
    )
