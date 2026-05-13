"""
Mimir — Quiz Router
POST /api/quiz/generate   — generate MCQ questions
POST /api/quiz/submit     — submit answers, update topic confidence
GET  /api/quiz/history    — past quiz sessions
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import QuizSession, Topic, get_db
from agent.tools import tool_quiz, compute_next_review

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    topic: str
    subject: str = ""
    n: int = 5

class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    answer: int
    explanation: str = ""

class SubmitRequest(BaseModel):
    topic_id: int
    score: int
    total: int

class SubmitResponse(BaseModel):
    confidence_score: float
    next_review: datetime
    message: str

class SessionResponse(BaseModel):
    id: int
    topic_id: int
    score: int
    total: int
    timestamp: datetime

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────

@router.post("/generate", response_model=list[QuizQuestion])
async def generate_quiz(req: GenerateRequest):
    questions = tool_quiz(topic=req.topic, subject=req.subject, n=req.n)
    if not questions:
        raise HTTPException(status_code=500, detail="Failed to generate quiz questions")
    return questions


@router.post("/submit", response_model=SubmitResponse)
async def submit_quiz(req: SubmitRequest, db: AsyncSession = Depends(get_db)):
    user_id = 1  # TODO: use auth

    # Fetch or validate topic
    result = await db.execute(
        select(Topic).where(Topic.id == req.topic_id, Topic.user_id == user_id)
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
        user_id=user_id,
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
async def quiz_history(limit: int = 20, db: AsyncSession = Depends(get_db)):
    user_id = 1  # TODO: use auth
    result = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id)
        .order_by(QuizSession.timestamp.desc())
        .limit(limit)
    )
    return result.scalars().all()
