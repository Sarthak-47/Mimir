"""
Mimir — AI Examiner Router

POST /api/examiner/mark  — evaluate a written answer against a mark scheme
"""

import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agent.tools import _llm
from routers.users import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────
class MarkRequest(BaseModel):
    question:    str
    mark_scheme: str        # key points, one per line or comma-separated
    answer:      str
    max_marks:   int = 10


class MarkResponse(BaseModel):
    marks_awarded:  int
    max_marks:      int
    percentage:     float
    verdict:        str            # "excellent" | "good" | "partial" | "poor"
    feedback:       str            # prose explanation aimed at the student
    awarded_points: list[str]      # mark-scheme points that were hit
    missed_points:  list[str]      # mark-scheme points that were missed


# ── Endpoint ─────────────────────────────────────────────────
@router.post("/mark", response_model=MarkResponse)
async def mark_answer(req: MarkRequest, _=Depends(get_current_user)):
    """Use the local Ollama model to mark a written answer against a mark scheme."""
    prompt = (
        "You are a strict but fair exam marker. Evaluate the student answer below "
        "against the provided mark scheme.\n\n"
        f"Question:\n{req.question}\n\n"
        f"Mark Scheme (each point = 1 mark, max {req.max_marks}):\n{req.mark_scheme}\n\n"
        f"Student Answer:\n{req.answer}\n\n"
        "Return a JSON object (no markdown, no preamble) exactly matching this shape:\n"
        "{\n"
        '  "marks_awarded": <integer 0 to ' + str(req.max_marks) + '>,\n'
        '  "feedback": "<1-3 sentence prose comment for the student>",\n'
        '  "awarded_points": ["<point 1 earned>", ...],\n'
        '  "missed_points": ["<point 1 missed>", ...]\n'
        "}"
    )

    try:
        raw = await asyncio.to_thread(_llm, prompt)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    # Parse JSON — try direct, then bracket scan, then regex
    stripped = raw.strip()
    data: dict = {}
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", stripped, re.DOTALL)
        if not m:
            raise HTTPException(status_code=503, detail="Marker returned unparseable output")
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            raise HTTPException(status_code=503, detail="Marker returned unparseable JSON")

    marks = max(0, min(req.max_marks, int(data.get("marks_awarded", 0))))
    pct   = round(marks / req.max_marks * 100, 1) if req.max_marks > 0 else 0.0
    verdict = (
        "excellent" if pct >= 80 else
        "good"      if pct >= 60 else
        "partial"   if pct >= 40 else
        "poor"
    )

    return MarkResponse(
        marks_awarded  = marks,
        max_marks      = req.max_marks,
        percentage     = pct,
        verdict        = verdict,
        feedback       = str(data.get("feedback", "")),
        awarded_points = [str(p) for p in data.get("awarded_points", [])],
        missed_points  = [str(p) for p in data.get("missed_points", [])],
    )
