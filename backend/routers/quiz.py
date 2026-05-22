"""
Mimir — Quiz Router
POST /api/quiz/generate   — generate MCQ questions
POST /api/quiz/submit     — submit answers, update topic confidence
GET  /api/quiz/history    — past quiz sessions
"""

import asyncio
from datetime import datetime

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import QuizSession, Topic, User, Misconception, get_db
from agent.tools import tool_quiz, tool_flashcards, compute_sm2, _llm
from routers.users import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class GenerateRequest(BaseModel):
    """Payload for ``POST /api/quiz/generate``."""
    topic: str
    subject: str = ""
    n: int = 5
    difficulty: str = "medium"

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


class GenerateWrittenRequest(BaseModel):
    """Payload for ``POST /api/quiz/generate-written``."""
    topic:   str
    subject: str = ""


class WrittenQuestion(BaseModel):
    """A single written-answer question with a key-points guide."""
    question:     str
    answer_guide: str   # bullet-point key points the answer should include
    max_marks:    int


class MarkTextRequest(BaseModel):
    """Payload for ``POST /api/quiz/mark-text``."""
    topic_id:     Optional[int] = None  # None → mark-only, skip SM-2
    question:     str
    answer_guide: str
    answer:       str
    max_marks:    int = 10


class MarkTextResponse(BaseModel):
    """Graded result of a written-answer submission."""
    marks_awarded:  int
    max_marks:      int
    percentage:     float
    verdict:        str
    feedback:       str
    awarded_points: list[str]
    missed_points:  list[str]
    # SM-2 update fields
    confidence_score: float
    next_review:      datetime
    message:          str


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
        questions = await asyncio.to_thread(
            tool_quiz, topic=req.topic, subject=req.subject, n=req.n, difficulty=req.difficulty
        )
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

    # Read current SM-2 state (with safe defaults for pre-migration rows)
    ease      = topic.sm2_ease_factor  if topic.sm2_ease_factor  is not None else 2.5
    reps      = topic.sm2_repetitions  if topic.sm2_repetitions  is not None else 0
    sm2_int   = topic.sm2_interval     if topic.sm2_interval      is not None else 1

    # Run the SM-2 algorithm
    new_ease, new_reps, new_interval, next_review = compute_sm2(
        score=req.score,
        total=req.total,
        ease_factor=ease,
        repetitions=reps,
        interval=sm2_int,
    )

    confidence = (req.score / req.total) * 100 if req.total > 0 else 0

    # Update topic with new SM-2 state
    topic.sm2_ease_factor  = new_ease
    topic.sm2_repetitions  = new_reps
    topic.sm2_interval     = new_interval
    topic.confidence_score = round(confidence, 1)
    topic.last_studied     = datetime.utcnow()
    topic.next_review      = next_review
    topic.study_count      += 1

    # ── Track misconceptions (score < 60 %) ──────────────────
    if confidence < 60.0:
        misc_result = await db.execute(
            select(Misconception).where(
                Misconception.user_id == current_user.id,
                Misconception.topic_id == topic.id,
            )
        )
        misc = misc_result.scalar_one_or_none()
        if misc:
            misc.count    += 1
            misc.last_seen = datetime.utcnow()
            misc.note      = f"Latest: {req.score}/{req.total} ({confidence:.0f}%)"
        else:
            db.add(Misconception(
                user_id  = current_user.id,
                topic_id = topic.id,
                note     = f"First low score: {req.score}/{req.total} ({confidence:.0f}%)",
            ))

    # Save quiz session
    session = QuizSession(
        user_id=current_user.id,
        topic_id=topic.id,
        score=req.score,
        total=req.total,
    )
    db.add(session)
    await db.commit()

    # Compose encouragement message with actual SM-2 interval
    pct = confidence
    if pct >= 90:
        msg = f"Outstanding! {req.score}/{req.total} — next review in {new_interval} days."
    elif pct >= 70:
        msg = f"Well done! {req.score}/{req.total} — next review in {new_interval} days."
    elif pct >= 60:
        msg = f"Passed, but review again soon. {req.score}/{req.total} — next review tomorrow."
    elif pct >= 40:
        msg = f"Needs more work. {req.score}/{req.total} — review again tomorrow."
    else:
        msg = f"Critical gap. {req.score}/{req.total} — review again tomorrow."

    return SubmitResponse(
        confidence_score=confidence,
        next_review=next_review,
        message=msg,
    )


@router.post("/generate-written", response_model=WrittenQuestion)
async def generate_written_question(
    req: GenerateWrittenRequest,
    _: User = Depends(get_current_user),
):
    """Generate one written-answer question with a key-points guide for marking."""
    prompt = (
        "Generate one university-level written-answer exam question about "
        f'"{req.topic}"'
        + (f' (subject: {req.subject})' if req.subject else "")
        + ".\n\n"
        "Return a JSON object (no markdown, no preamble):\n"
        "{\n"
        '  "question": "<full exam question>",\n'
        '  "answer_guide": "<key points an ideal answer should include, one per line>",\n'
        '  "max_marks": <integer 4 to 12>\n'
        "}"
    )
    try:
        raw = await asyncio.to_thread(_llm, prompt)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    import json as _json, re as _re
    stripped = raw.strip()
    data: dict = {}
    try:
        data = _json.loads(stripped)
    except _json.JSONDecodeError:
        m = _re.search(r"\{.*\}", stripped, _re.DOTALL)
        if not m:
            raise HTTPException(status_code=503, detail="Model returned unparseable output")
        data = _json.loads(m.group())

    return WrittenQuestion(
        question     = str(data.get("question", req.topic)),
        answer_guide = str(data.get("answer_guide", "")),
        max_marks    = max(4, min(12, int(data.get("max_marks", 8)))),
    )


@router.post("/mark-text", response_model=MarkTextResponse)
async def mark_text_answer(
    req: MarkTextRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a free-text answer and optionally update the topic's SM-2 state."""
    topic = None
    if req.topic_id is not None:
        result = await db.execute(
            select(Topic).where(
                Topic.id == req.topic_id,
                Topic.user_id == current_user.id,
            )
        )
        topic = result.scalar_one_or_none()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found")

    # Ask the LLM to mark the answer
    prompt = (
        "You are a strict but fair exam marker. Evaluate the student answer below "
        "against the provided key points.\n\n"
        f"Question:\n{req.question}\n\n"
        f"Key Points (each = 1 mark, max {req.max_marks}):\n{req.answer_guide}\n\n"
        f"Student Answer:\n{req.answer}\n\n"
        "Return a JSON object (no markdown, no preamble):\n"
        "{\n"
        f'  "marks_awarded": <integer 0 to {req.max_marks}>,\n'
        '  "feedback": "<1-3 sentence prose for the student>",\n'
        '  "awarded_points": ["<earned point 1>", ...],\n'
        '  "missed_points": ["<missed point 1>", ...]\n'
        "}"
    )
    try:
        raw = await asyncio.to_thread(_llm, prompt)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    import json as _json, re as _re
    stripped = raw.strip()
    mdata: dict = {}
    try:
        mdata = _json.loads(stripped)
    except _json.JSONDecodeError:
        m = _re.search(r"\{.*\}", stripped, _re.DOTALL)
        if not m:
            raise HTTPException(status_code=503, detail="Marker returned unparseable output")
        mdata = _json.loads(m.group())

    marks = max(0, min(req.max_marks, int(mdata.get("marks_awarded", 0))))
    pct   = round(marks / req.max_marks * 100, 1) if req.max_marks > 0 else 0.0
    verdict = (
        "excellent" if pct >= 80 else
        "good"      if pct >= 60 else
        "partial"   if pct >= 40 else
        "poor"
    )

    new_interval = 1
    next_review  = datetime.utcnow()

    if topic is not None:
        # Update SM-2 (treat marks/max_marks like score/total for MCQ)
        ease    = topic.sm2_ease_factor if topic.sm2_ease_factor is not None else 2.5
        reps    = topic.sm2_repetitions if topic.sm2_repetitions is not None else 0
        sm2_int = topic.sm2_interval    if topic.sm2_interval    is not None else 1

        new_ease, new_reps, new_interval, next_review = compute_sm2(
            score=marks,
            total=req.max_marks,
            ease_factor=ease,
            repetitions=reps,
            interval=sm2_int,
        )

        topic.sm2_ease_factor  = new_ease
        topic.sm2_repetitions  = new_reps
        topic.sm2_interval     = new_interval
        topic.confidence_score = round(pct, 1)
        topic.last_studied     = datetime.utcnow()
        topic.next_review      = next_review
        topic.study_count      += 1

        if pct < 60.0:
            misc_result = await db.execute(
                select(Misconception).where(
                    Misconception.user_id == current_user.id,
                    Misconception.topic_id == topic.id,
                )
            )
            misc = misc_result.scalar_one_or_none()
            if misc:
                misc.count    += 1
                misc.last_seen = datetime.utcnow()
                misc.note      = f"Written: {marks}/{req.max_marks} ({pct:.0f}%)"
            else:
                db.add(Misconception(
                    user_id  = current_user.id,
                    topic_id = topic.id,
                    note     = f"Written first low: {marks}/{req.max_marks} ({pct:.0f}%)",
                ))

        session = QuizSession(
            user_id  = current_user.id,
            topic_id = topic.id,
            score    = marks,
            total    = req.max_marks,
        )
        db.add(session)
        await db.commit()

    if pct >= 90:
        msg = f"Outstanding! {marks}/{req.max_marks}."
    elif pct >= 70:
        msg = f"Well done! {marks}/{req.max_marks}."
    elif pct >= 60:
        msg = f"Passed. Review again soon."
    elif pct >= 40:
        msg = f"Needs more work. {marks}/{req.max_marks}."
    else:
        msg = f"Critical gap. {marks}/{req.max_marks}."

    return MarkTextResponse(
        marks_awarded   = marks,
        max_marks       = req.max_marks,
        percentage      = pct,
        verdict         = verdict,
        feedback        = str(mdata.get("feedback", "")),
        awarded_points  = [str(p) for p in mdata.get("awarded_points", [])],
        missed_points   = [str(p) for p in mdata.get("missed_points", [])],
        confidence_score = pct,
        next_review      = next_review,
        message          = msg,
    )


# ── Flashcards ───────────────────────────────────────────────

class FlashcardRequest(BaseModel):
    """Payload for ``POST /api/quiz/flashcards``."""
    topic:   str
    subject: str = ""
    n:       int = 10


class Flashcard(BaseModel):
    """A single flashcard — term on the front, definition/answer on the back."""
    front: str
    back:  str


class FlashcardResultRequest(BaseModel):
    """Payload for recording a flashcard session result for SM-2."""
    topic_id: int
    # SM-2 grade 1–5: 5=easy, 4=good, 3=hard, 1=forgot
    avg_grade: float


@router.post("/flashcards", response_model=list[Flashcard])
async def generate_flashcards(
    req: FlashcardRequest,
    _: User = Depends(get_current_user),
):
    """Generate flashcard pairs (front/back) using the LLM via ``tool_flashcards``."""
    try:
        cards = await asyncio.to_thread(
            tool_flashcards, topic=req.topic if not req.subject else f"{req.topic} ({req.subject})", n=req.n
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc
    if not cards:
        raise HTTPException(status_code=503, detail="Flashcard generation failed — is Ollama running?")
    return [Flashcard(front=c.get("front", ""), back=c.get("back", "")) for c in cards]


@router.post("/flashcard-result", response_model=SubmitResponse)
async def submit_flashcard_result(
    req: FlashcardResultRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record a flashcard session outcome and update SM-2 for the topic."""
    topic = await db.get(Topic, req.topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    ease      = topic.sm2_ease_factor  if topic.sm2_ease_factor  is not None else 2.5
    reps      = topic.sm2_repetitions  if topic.sm2_repetitions  is not None else 0
    sm2_int   = topic.sm2_interval     if topic.sm2_interval      is not None else 1

    grade = max(1, min(5, round(req.avg_grade)))
    new_ease, new_reps, new_interval, next_review = compute_sm2(
        grade=grade,
        ease=ease,
        repetitions=reps,
        interval=sm2_int,
    )

    topic.sm2_ease_factor  = new_ease
    topic.sm2_repetitions  = new_reps
    topic.sm2_interval     = new_interval
    topic.next_review      = next_review
    topic.confidence_score = round((req.avg_grade / 5.0) * 100, 1)
    topic.last_studied     = datetime.utcnow()
    await db.commit()

    pct = topic.confidence_score
    if   pct >= 80: msg = f"Excellent recall! Next review in {new_interval} days."
    elif pct >= 60: msg = f"Good work. Next review in {new_interval} days."
    elif pct >= 40: msg = f"Needs practice. Review again soon."
    else:           msg = f"Keep drilling. Review again tomorrow."

    return SubmitResponse(confidence_score=pct, next_review=next_review, message=msg)


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
