"""
Mimir — Progress Router
GET /api/progress/stats      — overall stats (days, accuracy, streak)
GET /api/progress/topics     — topic confidence scores
GET /api/progress/weaknesses — topics below threshold, sorted
GET /api/progress/subjects   — CRUD for subjects
"""

from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from memory.database import (
    Subject, Topic, QuizSession, Conversation, User, get_db,
)
from agent.tools import tool_weak_topics

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class StatsResponse(BaseModel):
    days_at_well: int
    trial_accuracy: float
    streak: int
    total_quizzes: int

class TopicResponse(BaseModel):
    id: int
    name: str
    subject_id: int
    confidence_score: float
    last_studied: datetime | None
    next_review: datetime | None
    study_count: int

    class Config:
        from_attributes = True

class WeaknessResponse(BaseModel):
    topic: str
    score: float
    status: str

class SubjectCreate(BaseModel):
    name: str
    color: str = "#6ab87a"

class SubjectResponse(BaseModel):
    id: int
    name: str
    color: str
    created_at: datetime

    class Config:
        from_attributes = True

class TopicCreate(BaseModel):
    name: str
    subject_id: int


# ── Stats ────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    user_id = 1  # TODO: use auth

    # Days at well: days since account creation
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    days = (datetime.utcnow() - user.created_at).days if user else 0

    # Trial accuracy: avg score across all quiz sessions
    sessions_result = await db.execute(
        select(QuizSession).where(QuizSession.user_id == user_id)
    )
    sessions = sessions_result.scalars().all()
    total_quizzes = len(sessions)
    if sessions:
        accuracy = sum(s.score / s.total * 100 for s in sessions if s.total > 0) / total_quizzes
    else:
        accuracy = 0.0

    return StatsResponse(
        days_at_well=days,
        trial_accuracy=round(accuracy, 1),
        streak=0,         # TODO: compute daily streak from quiz timestamps
        total_quizzes=total_quizzes,
    )


# ── Topics ───────────────────────────────────────────────────
@router.get("/topics", response_model=list[TopicResponse])
async def get_topics(subject_id: int | None = None, db: AsyncSession = Depends(get_db)):
    user_id = 1
    query = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        query = query.where(Topic.subject_id == subject_id)
    result = await db.execute(query.order_by(Topic.confidence_score))
    return result.scalars().all()


@router.post("/topics", response_model=TopicResponse, status_code=201)
async def create_topic(req: TopicCreate, db: AsyncSession = Depends(get_db)):
    user_id = 1
    topic = Topic(user_id=user_id, subject_id=req.subject_id, name=req.name)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


# ── Weaknesses ───────────────────────────────────────────────
@router.get("/weaknesses", response_model=list[WeaknessResponse])
async def get_weaknesses(subject_id: int | None = None, db: AsyncSession = Depends(get_db)):
    user_id = 1
    query = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        query = query.where(Topic.subject_id == subject_id)
    result = await db.execute(query)
    topics = result.scalars().all()

    raw = [{"name": t.name, "confidence_score": t.confidence_score} for t in topics]
    return tool_weak_topics(raw)


# ── Subjects ─────────────────────────────────────────────────
@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    user_id = 1
    result = await db.execute(select(Subject).where(Subject.user_id == user_id))
    return result.scalars().all()


@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def create_subject(req: SubjectCreate, db: AsyncSession = Depends(get_db)):
    user_id = 1
    subject = Subject(user_id=user_id, name=req.name, color=req.color)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}", status_code=204)
async def delete_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    user_id = 1
    result = await db.execute(
        select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
    )
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subject)
    await db.commit()
