"""
Mimir — Progress Router
GET /api/progress/stats       — overall stats (days, accuracy, streak)
GET /api/progress/topics      — topic confidence scores
GET /api/progress/weaknesses  — topics below threshold, sorted
GET /api/progress/due         — SM-2 due-today review queue
GET/POST/DELETE /api/progress/subjects — CRUD for subjects
GET/POST /api/progress/topics — topic CRUD
GET/PUT /api/progress/exam-date — exam date management
GET /api/progress/readiness   — per-topic Ebbinghaus-decayed readiness
GET /api/progress/schedule    — 7-day personalised study schedule
"""

from datetime import date as DateType, datetime, timezone

def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import (
    Subject, Topic, QuizSession, Conversation, User, get_db,
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


class PredictedGradeResponse(BaseModel):
    grade:       str     # A / B / C / D / F
    percentage:  float   # predicted exam score 0–100
    trend:       str     # "improving" | "stable" | "declining"
    confidence:  str     # "high" | "medium" | "low"
    summary:     str     # one-line prose for the UI


class HeatmapDay(BaseModel):
    date:       str   # YYYY-MM-DD
    quiz_count: int
    chat_count: int
    total:      int


class TopicActivity(BaseModel):
    topic_id:   int
    name:       str
    subject_id: int
    count:      int   # quiz sessions in window


class HeatmapResponse(BaseModel):
    days:     list[HeatmapDay]
    by_topic: list[TopicActivity]


class VelocityEntry(BaseModel):
    """Per-topic learning velocity derived from quiz session history."""
    id:            int
    name:          str
    subject_id:    int
    velocity:      str          # "mastered" | "rising" | "stable" | "falling" | "untested"
    slope:         float        # percentage-points change per session (+ = improving)
    recent_scores: list[float]  # last ≤8 session percentages, oldest first
    session_count: int
    latest_score:  float        # most recent session percentage (0 if untested)


class DueTopicResponse(BaseModel):
    """A topic whose next_review date has passed — ready for a new quiz session."""
    id:            int
    name:          str
    subject_id:    int
    subject_name:  str
    next_review:   datetime
    sm2_interval:  int       # days between reviews (higher = well-learned)
    confidence_score: float

    class Config:
        from_attributes = True


# ── Stats ────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Compute and return the user's overall progress statistics in one query."""
    user_id = current_user.id

    # Days at well: days since account creation
    days = (_utcnow() - current_user.created_at).days

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


# ── Due for review ────────────────────────────────────────────
@router.get("/due", response_model=list[DueTopicResponse])
async def get_due_topics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return topics whose next_review date has passed (SM-2 due queue)."""
    now = _utcnow()
    result = await db.execute(
        select(Topic, Subject.name.label("subject_name"))
        .join(Subject, Topic.subject_id == Subject.id)
        .where(Subject.user_id == current_user.id)
        .where(Topic.next_review != None)        # noqa: E711
        .where(Topic.next_review <= now)
        .order_by(Topic.next_review.asc())
    )
    rows = result.all()
    return [
        DueTopicResponse(
            id=t.id,
            name=t.name,
            subject_id=t.subject_id,
            subject_name=subj_name,
            next_review=t.next_review,
            sm2_interval=t.sm2_interval or 1,
            confidence_score=t.confidence_score or 0.0,
        )
        for t, subj_name in rows
    ]


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

    now = _utcnow()
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

    now = _utcnow()

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


# ── Predicted Grade ──────────────────────────────────────────

@router.get("/predicted-grade", response_model=PredictedGradeResponse)
async def get_predicted_grade(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Predict the user's likely exam performance based on:
    - Average Ebbinghaus-decayed readiness across all topics
    - Recent quiz trajectory (last 10 sessions vs previous 10)
    - Days remaining until exam (less time = harder to improve)
    """
    user_id = current_user.id

    topics_result = await db.execute(select(Topic).where(Topic.user_id == user_id))
    topics = topics_result.scalars().all()

    sessions_result = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id)
        .order_by(QuizSession.timestamp.desc())
    )
    all_sessions = sessions_result.scalars().all()

    if not topics:
        return PredictedGradeResponse(
            grade="?",
            percentage=0.0,
            trend="stable",
            confidence="low",
            summary="No topics tracked yet. Start studying to get a prediction.",
        )

    sessions_by_topic: dict[int, list[QuizSession]] = {}
    for s in all_sessions:
        sessions_by_topic.setdefault(s.topic_id, []).append(s)

    now = _utcnow()
    readiness_scores = [
        calculate_topic_readiness(t, sessions_by_topic.get(t.id, []), now=now)
        for t in topics
    ]
    avg_readiness = sum(readiness_scores) / len(readiness_scores)

    # Trajectory: compare average score of last-10 vs previous-10 sessions
    trend = "stable"
    confidence = "medium"
    if len(all_sessions) >= 6:
        recent_10 = all_sessions[:10]
        older_10  = all_sessions[10:20]
        recent_avg = sum(s.score / s.total * 100 for s in recent_10 if s.total > 0) / max(1, len(recent_10))
        if older_10:
            older_avg = sum(s.score / s.total * 100 for s in older_10 if s.total > 0) / max(1, len(older_10))
            diff = recent_avg - older_avg
            if diff > 5:
                trend = "improving"
            elif diff < -5:
                trend = "declining"
        confidence = "high" if len(all_sessions) >= 20 else "medium"
    elif len(all_sessions) < 3:
        confidence = "low"

    # Blend readiness with trajectory
    trend_bump = 3.0 if trend == "improving" else (-3.0 if trend == "declining" else 0.0)
    raw_pct = min(100.0, max(0.0, avg_readiness + trend_bump))

    # Days-to-exam penalty: few days left → harder to revise up
    if current_user.exam_date:
        days_left = (current_user.exam_date - now.date()).days
        if 0 < days_left < 7:
            raw_pct = min(raw_pct, raw_pct * 0.95)  # slight ceiling pressure
    predicted = round(raw_pct, 1)

    def _grade(pct: float) -> str:
        if pct >= 85: return "A"
        if pct >= 70: return "B"
        if pct >= 55: return "C"
        if pct >= 40: return "D"
        return "F"

    grade = _grade(predicted)

    trend_text = {"improving": "on an upward trajectory", "declining": "declining recently", "stable": "holding steady"}.get(trend, "stable")
    summary = f"Predicted {grade} ({predicted:.0f}%) — {len(topics)} topics tracked, {trend_text}."

    return PredictedGradeResponse(
        grade=grade,
        percentage=predicted,
        trend=trend,
        confidence=confidence,
        summary=summary,
    )


# ── Velocity ─────────────────────────────────────────────────

def _linear_slope(scores: list[float]) -> float:
    """Least-squares slope of scores (percentage points per session)."""
    n = len(scores)
    if n < 2:
        return 0.0
    x_mean = (n - 1) / 2.0
    y_mean = sum(scores) / n
    num = sum((i - x_mean) * (scores[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return round(num / den, 2) if den else 0.0


def _velocity_label(slope: float, latest: float, count: int) -> str:
    """Map slope + latest score → human-readable velocity label."""
    if count < 2:
        return "untested"
    if latest >= 85 and slope >= -2:
        return "mastered"
    if slope > 4:
        return "rising"
    if slope < -4:
        return "falling"
    return "stable"


@router.get("/velocity", response_model=list[VelocityEntry])
async def get_velocity(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return per-topic learning velocity derived from quiz session history.

    For each topic, computes a linear regression slope over the last 8 sessions
    (in % per session) and labels it as:

    - **mastered** — latest score ≥ 85 % and not declining sharply
    - **rising**   — slope > +4 pp/session
    - **stable**   — slope between −4 and +4
    - **falling**  — slope < −4 pp/session
    - **untested** — fewer than 2 sessions recorded

    Topics are sorted: falling first (needs attention), then stable, then
    rising, then mastered, then untested.
    """
    user_id = current_user.id

    # Load topics
    topic_q = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        topic_q = topic_q.where(Topic.subject_id == subject_id)
    topics_result = await db.execute(topic_q)
    topics = topics_result.scalars().all()

    if not topics:
        return []

    # Load all sessions for this user once
    sessions_result = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id)
        .order_by(QuizSession.timestamp.asc())   # oldest first → correct slope direction
    )
    all_sessions = sessions_result.scalars().all()

    # Group by topic_id
    by_topic: dict[int, list[QuizSession]] = {}
    for s in all_sessions:
        by_topic.setdefault(s.topic_id, []).append(s)

    _ORDER = {"falling": 0, "stable": 1, "rising": 2, "mastered": 3, "untested": 4}

    rows: list[VelocityEntry] = []
    for t in topics:
        sessions = by_topic.get(t.id, [])
        # Take last 8, convert to percentage
        recent = sessions[-8:]
        scores = [
            round(s.score / s.total * 100, 1) for s in recent if s.total > 0
        ]
        slope  = _linear_slope(scores)
        latest = scores[-1] if scores else 0.0
        label  = _velocity_label(slope, latest, len(scores))

        rows.append(VelocityEntry(
            id=t.id,
            name=t.name,
            subject_id=t.subject_id,
            velocity=label,
            slope=slope,
            recent_scores=scores,
            session_count=len(sessions),
            latest_score=latest,
        ))

    rows.sort(key=lambda r: (_ORDER.get(r.velocity, 99), -abs(r.slope)))
    return rows


# ── Heatmap ──────────────────────────────────────────────────

@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return daily activity counts for the last N days plus per-topic quiz counts.

    Activity = quiz sessions + user-role chat messages on that day.
    Returns exactly ``days`` entries in chronological order (oldest first),
    padded with zeros for days with no activity.
    """
    from datetime import timedelta, date as date_type

    user_id = current_user.id
    days    = max(7, min(90, days))
    cutoff  = _utcnow() - timedelta(days=days)
    today   = _utcnow().date()

    # Quiz sessions in window
    quiz_res = await db.execute(
        select(QuizSession)
        .where(QuizSession.user_id == user_id, QuizSession.timestamp >= cutoff)
    )
    quiz_sessions = quiz_res.scalars().all()

    # Chat messages (user role only) in window
    chat_res = await db.execute(
        select(Conversation)
        .where(
            Conversation.user_id == user_id,
            Conversation.role == "user",
            Conversation.timestamp >= cutoff,
        )
    )
    chat_msgs = chat_res.scalars().all()

    # Build daily buckets
    quiz_by_day: dict[date_type, int] = {}
    for s in quiz_sessions:
        d = s.timestamp.date()
        quiz_by_day[d] = quiz_by_day.get(d, 0) + 1

    chat_by_day: dict[date_type, int] = {}
    for m in chat_msgs:
        d = m.timestamp.date()
        chat_by_day[d] = chat_by_day.get(d, 0) + 1

    result_days: list[HeatmapDay] = []
    from datetime import timedelta
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        qc = quiz_by_day.get(d, 0)
        cc = chat_by_day.get(d, 0)
        result_days.append(HeatmapDay(
            date=d.isoformat(),
            quiz_count=qc,
            chat_count=cc,
            total=qc + cc,
        ))

    # Per-topic quiz counts in window
    topics_res = await db.execute(select(Topic).where(Topic.user_id == user_id))
    topics_map = {t.id: t for t in topics_res.scalars().all()}

    topic_counts: dict[int, int] = {}
    for s in quiz_sessions:
        topic_counts[s.topic_id] = topic_counts.get(s.topic_id, 0) + 1

    by_topic: list[TopicActivity] = []
    for tid, count in sorted(topic_counts.items(), key=lambda x: -x[1]):
        t = topics_map.get(tid)
        if t:
            by_topic.append(TopicActivity(
                topic_id=t.id,
                name=t.name,
                subject_id=t.subject_id,
                count=count,
            ))

    return HeatmapResponse(days=result_days, by_topic=by_topic)
