"""
Mimir — Quiz Router
POST /api/quiz/generate   — generate MCQ questions
POST /api/quiz/submit     — submit answers, update topic confidence
GET  /api/quiz/history    — past quiz sessions
"""

import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import QuizSession, Topic, User, get_db
from agent.tools import tool_quiz, compute_next_review
from routers.users import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    """Payload for ``POST /api/quiz/generate``."""
    topic: str
    subject: str = ""
    n: int = 5

class QuizQuestion(BaseModel):
    """A single MCQ question as returned by the quiz generator."""
    question: str
    options: list[str]
    answer: int        # 0-based index of the correct option
    explanation: str = ""

class SubmitRequest(BaseModel):
    """Payload for ``POST /api/quiz/submit``."""
    topic_id: int
    score: int
    total: int

class SubmitResponse(BaseModel):
    """Result of a quiz submission, including the new spaced-repetition schedule."""
    confidence_score: float
    next_review: datetime
    message: str

class SessionResponse(BaseModel):
    """One row in the quiz history response."""
    id: int
    topic_id: int
    topic_name: str = "Unknown"
    score: int
    total: int
    timestamp: datetime


# ── Endpoints ────────────────────────────────────────────────

@router.post("/generate", response_model=list[QuizQuestion])
async def generate_quiz(
    req: GenerateRequest,
    _: User = Depends(get_current_user),   # auth guard only
):
    """Generate MCQ questions by calling the Ollama model via ``tool_quiz``.

    Runs the synchronous LLM call in a thread pool to avoid blocking the event
    loop. Returns 503 if Ollama is unavailable or returns no questions.
    """
    try:
        questions = await asyncio.to_thread(tool_quiz, topic=req.topic, subject=req.subject, n=req.n)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc
    if not questions:
        raise HTTPException(status_code=503, detail="Quiz generation failed — is Ollama running with the model loaded?")
    return questions


@router.post("/submit", response_model=SubmitResponse)
async def submit_quiz(
    req: SubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a quiz result and update the topic's confidence score and next review date.

    Raises 404 if the topic does not exist or belongs to a different user.
    Returns a motivational message scaled to the percentage score.
    """
    # Fetch and verify topic belongs to this user
    result = await db.execute(
        select(Topic).where(
            Topic.id == req.topic_id,
            Topic.user_id == current_user.id,
        )
    )
    topic = result.scalar_one_or_none()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Update spaced repetition fields
    confidence = (req.score / req.total) * 100 if req.total > 0 else 0
    next_review = compute_next_review(req.score, req.total)

    topic.confidence_score = round(confidence, 1)
    topic.last_studied     = datetime.utcnow()
    topic.next_review      = next_review
    topic.study_count      += 1

    # Save quiz session
    session = QuizSession(
        user_id=current_user.id,
        topic_id=topic.id,
        score=req.score,
        total=req.total,
    )
    db.add(session)
    await db.commit()

    # Compose encouragement message
    if confidence >= 80:
        msg = f"Outstanding! {req.score}/{req.total} — you've mastered this. Review in 7 days."
    elif confidence >= 60:
        msg = f"Good effort! {req.score}/{req.total} — keep going. Review in 3 days."
    elif confidence >= 40:
        msg = f"Keep practicing! {req.score}/{req.total} — review tomorrow."
    else:
        msg = f"This needs work — {req.score}/{req.total}. Review in 4 hours."

    return SubmitResponse(
        confidence_score=confidence,
        next_review=next_review,
        message=msg,
    )


@router.get("/history", response_model=list[SessionResponse])
async def quiz_history(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent quiz sessions for the current user, newest first.

    Topic names are batch-fetched in a single query to avoid N+1 round trips.
    """
    result = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == current_user.id)
        .order_by(QuizSession.timestamp.desc())
        .limit(limit)
    )
    sessions = result.scalars().all()

    # Batch-fetch topic names
    topic_ids = list({s.topic_id for s in sessions if s.topic_id is not None})
    topics_map: dict[int, str] = {}
    if topic_ids:
        t_result = await db.execute(
            select(Topic).where(Topic.id.in_(topic_ids))
        )
        for t in t_result.scalars().all():
            topics_map[t.id] = t.name

    return [
        SessionResponse(
            id=s.id,
            topic_id=s.topic_id,
            topic_name=topics_map.get(s.topic_id, "Unknown"),
            score=s.score,
            total=s.total,
            timestamp=s.timestamp,
        )
        for s in sessions
    ]
