"""
Mimir — Progress Router
GET /api/progress/stats       — overall stats (days, accuracy, streak)
GET /api/progress/topics      — topic confidence scores
GET /api/progress/weaknesses  — topics below threshold, sorted
GET/POST/DELETE /api/progress/subjects — CRUD for subjects
GET/POST /api/progress/topics — topic CRUD
GET/PUT /api/progress/exam-date — exam date management
GET /api/progress/readiness   — per-topic Ebbinghaus-decayed readiness
GET /api/progress/schedule    — 7-day personalised study schedule
"""

from datetime import date as DateType, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import (
    Subject, Topic, QuizSession, User, get_db,
)
from memory.readiness import (
    calculate_topic_readiness, decay_days, priority_label, generate_schedule,
)
from agent.tools import tool_weak_topics
from routers.users import get_current_user
from scheduler import compute_streak

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class StatsResponse(BaseModel):
    """Overall progress summary for the stats widget and Reckoning view."""
    days_at_well: int       # days since account creation
    trial_accuracy: float   # average quiz score across all sessions (0–100)
    streak: int             # current consecutive-day study streak
    total_quizzes: int

class TopicResponse(BaseModel):
    """Full topic record including spaced-repetition fields."""
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
    """One entry in the weakness analysis: topic name, score, and severity label."""
    topic: str
    score: float
    status: str   # 'critical' | 'weak' | 'moderate' | 'strong'

class SubjectCreate(BaseModel):
    """Payload for creating a new study discipline."""
    name: str
    color: str = "#6ab87a"

class SubjectResponse(BaseModel):
    """Public representation of a subject."""
    id: int
    name: str
    color: str
    created_at: datetime

    class Config:
        from_attributes = True

class TopicCreate(BaseModel):
    """Payload for creating a new topic under a subject."""
    name: str
    subject_id: int

class ExamDateRequest(BaseModel):
    """Payload for setting the user's upcoming exam date."""
    exam_date: Optional[DateType] = None   # ISO date string YYYY-MM-DD, or null to clear

class ExamDateResponse(BaseModel):
    """Current exam date for the authenticated user."""
    exam_date: Optional[DateType]

class ReadinessResponse(BaseModel):
    """Per-topic readiness — Ebbinghaus-decayed confidence + quiz blend."""
    id:               int
    name:             str
    subject_id:       int
    confidence_score: float    # raw SM-2 confidence
    readiness:        float    # decayed + quiz-blended score (0–100)
    priority:         str      # 'critical' | 'weak' | 'moderate' | 'strong'
    last_studied:     Optional[datetime]
    days_since:       float    # days elapsed since last study session

    class Config:
        from_attributes = True

class ScheduleTopicEntry(BaseModel):
    name:      str
    subject:   str
    readiness: float
    priority:  str

class ScheduleDay(BaseModel):
    date:            str
    day_label:       str
    days_until_exam: Optional[int]
    topics:          list[ScheduleTopicEntry]


# ── Stats ────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compute and return the user's overall progress statistics in one query."""
    user_id = current_user.id

    # Days at well: days since account creation
    days = (datetime.utcnow() - current_user.created_at).days

    # Trial accuracy + streak from quiz sessions
    sessions_result = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id)
        .order_by(QuizSession.timestamp.desc())
    )
    sessions = sessions_result.scalars().all()
    total_quizzes = len(sessions)

    if sessions:
        accuracy = sum(s.score / s.total * 100 for s in sessions if s.total > 0) / total_quizzes
    else:
        accuracy = 0.0

    session_dates = [s.timestamp.date() for s in sessions]
    streak = compute_streak(session_dates)

    return StatsResponse(
        days_at_well=days,
        trial_accuracy=round(accuracy, 1),
        streak=streak,
        total_quizzes=total_quizzes,
    )


# ── Topics ───────────────────────────────────────────────────
@router.get("/topics", response_model=list[TopicResponse])
async def get_topics(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List topics for the current user, sorted by confidence ascending (weakest first)."""
    user_id = current_user.id
    query = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        query = query.where(Topic.subject_id == subject_id)
    result = await db.execute(query.order_by(Topic.confidence_score))
    return result.scalars().all()


@router.post("/topics", response_model=TopicResponse, status_code=201)
async def create_topic(
    req: TopicCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new topic under the specified subject for the current user."""
    topic = Topic(user_id=current_user.id, subject_id=req.subject_id, name=req.name)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return topic


# ── Weaknesses ───────────────────────────────────────────────
@router.get("/weaknesses", response_model=list[WeaknessResponse])
async def get_weaknesses(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all topics sorted by confidence score ascending, each labelled by severity."""
    user_id = current_user.id
    query = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        query = query.where(Topic.subject_id == subject_id)
    result = await db.execute(query)
    topics = result.scalars().all()

    raw = [{"name": t.name, "confidence_score": t.confidence_score} for t in topics]
    return tool_weak_topics(raw)


# ── Subjects ─────────────────────────────────────────────────
@router.get("/subjects", response_model=list[SubjectResponse])
async def list_subjects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all subjects owned by the current user."""
    result = await db.execute(
        select(Subject).where(Subject.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("/subjects", response_model=SubjectResponse, status_code=201)
async def create_subject(
    req: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new study discipline for the current user."""
    subject = Subject(user_id=current_user.id, name=req.name, color=req.color)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}", status_code=204)
async def delete_subject(
    subject_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a subject and all its topics (cascade). Raises 404 if not found."""
    result = await db.execute(
        select(Subject).where(
            Subject.id == subject_id,
            Subject.user_id == current_user.id,
        )
    )
    subject = result.scalar_one_or_none()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subject)
    await db.commit()


# ── Exam date ────────────────────────────────────────────────

@router.get("/exam-date", response_model=ExamDateResponse)
async def get_exam_date(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the user's currently saved exam date (or null if not set)."""
    return ExamDateResponse(exam_date=current_user.exam_date)


@router.put("/exam-date", response_model=ExamDateResponse)
async def set_exam_date(
    req: ExamDateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist (or clear) the user's exam date."""
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one()
    user.exam_date = req.exam_date
    await db.commit()
    await db.refresh(user)
    return ExamDateResponse(exam_date=user.exam_date)


# ── Readiness ────────────────────────────────────────────────

@router.get("/readiness", response_model=list[ReadinessResponse])
async def get_readiness(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return per-topic readiness scores using the Ebbinghaus forgetting curve.

    Readiness = Ebbinghaus-decayed confidence blended with recency-weighted
    quiz average. Topics are ordered from least ready (highest priority) first.
    """
    user_id = current_user.id

    # Fetch topics
    topic_q = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        topic_q = topic_q.where(Topic.subject_id == subject_id)
    topics_result = await db.execute(topic_q)
    topics = topics_result.scalars().all()

    # Fetch all quiz sessions for this user (one query, filter in Python)
    sessions_result = await db.execute(
        select(QuizSession).where(QuizSession.user_id == user_id)
    )
    all_sessions = sessions_result.scalars().all()

    # Group sessions by topic_id
    sessions_by_topic: dict[int, list[QuizSession]] = {}
    for s in all_sessions:
        sessions_by_topic.setdefault(s.topic_id, []).append(s)

    now = datetime.utcnow()
    rows: list[ReadinessResponse] = []
    for t in topics:
        t_sessions = sessions_by_topic.get(t.id, [])
        r = calculate_topic_readiness(t, t_sessions, now=now)
        rows.append(ReadinessResponse(
            id=t.id,
            name=t.name,
            subject_id=t.subject_id,
            confidence_score=t.confidence_score,
            readiness=round(r, 1),
            priority=priority_label(r),
            last_studied=t.last_studied,
            days_since=round(decay_days(t, now=now), 1),
        ))

    # Return weakest first
    rows.sort(key=lambda x: x.readiness)
    return rows


# ── Schedule ─────────────────────────────────────────────────

@router.get("/schedule", response_model=list[ScheduleDay])
async def get_schedule(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a personalised 7-day study schedule.

    Topics are ranked by urgency (low readiness × exam time pressure) and
    distributed across the coming week so each day has up to 3 recommendations.
    """
    user_id = current_user.id

    # Load topics + subjects + sessions
    topics_result = await db.execute(
        select(Topic).where(Topic.user_id == user_id)
    )
    topics = topics_result.scalars().all()

    subjects_result = await db.execute(
        select(Subject).where(Subject.user_id == user_id)
    )
    subjects = {s.id: s.name for s in subjects_result.scalars().all()}

    sessions_result = await db.execute(
        select(QuizSession).where(QuizSession.user_id == user_id)
    )
    sessions_by_topic: dict[int, list[QuizSession]] = {}
    for s in sessions_result.scalars().all():
        sessions_by_topic.setdefault(s.topic_id, []).append(s)

    now = datetime.utcnow()

    # Build enriched topic list
    enriched: list[dict] = []
    for t in topics:
        t_sessions = sessions_by_topic.get(t.id, [])
        r = calculate_topic_readiness(t, t_sessions, now=now)
        enriched.append({
            "name":         t.name,
            "subject_name": subjects.get(t.subject_id, "Unknown"),
            "readiness":    r,
        })

    # Determine exam date
    exam_dt: datetime | None = None
    if current_user.exam_date:
        exam_dt = datetime.combine(current_user.exam_date, datetime.min.time())

    raw_schedule = generate_schedule(enriched, exam_date=exam_dt, now=now)

    return [
        ScheduleDay(
            date=d["date"],
            day_label=d["day_label"],
            days_until_exam=d["days_until_exam"],
            topics=[ScheduleTopicEntry(**t) for t in d["topics"]],
        )
        for d in raw_schedule
    ]
