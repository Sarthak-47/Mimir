"""
Mimir — Syllabus Router

Endpoints:
    GET    /api/syllabus                    — list all syllabi for the user
    POST   /api/syllabus                    — create a new empty syllabus
    DELETE /api/syllabus/{syllabus_id}      — delete a syllabus and all its items
    GET    /api/syllabus/{syllabus_id}/items — list items in a syllabus with coverage
    POST   /api/syllabus/{syllabus_id}/items — add items (bulk text import)
    DELETE /api/syllabus/{syllabus_id}/items/{item_id} — delete one item
    GET    /api/syllabus/{syllabus_id}/coverage — per-section coverage summary
"""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete, func

from memory.database import Syllabus, SyllabusItem, Topic, User, get_db
from routers.users import get_current_user

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────

class SyllabusCreate(BaseModel):
    name:       str
    exam_board: str = ""
    level:      str = ""


class SyllabusResponse(BaseModel):
    id:         int
    name:       str
    exam_board: str
    level:      str
    created_at: datetime
    item_count: int = 0

    class Config:
        from_attributes = True


class SyllabusItemResponse(BaseModel):
    id:          int
    syllabus_id: int
    section:     str
    topic_name:  str
    order_index: int
    # Coverage fields — computed at read time
    confidence:  float = 0.0      # 0–100 from matching Topic row; 0 if never studied
    studied:     bool  = False    # True if a Topic with this name exists and has been quizzed

    class Config:
        from_attributes = True


class BulkImportRequest(BaseModel):
    """
    Bulk-import syllabus items from pasted text.

    Each non-empty line becomes one item.  Lines starting with ``#`` or ``##``
    are treated as section headers rather than topic entries.

    Example input::

        # Organic Chemistry
        Alkanes and alkenes
        Functional groups
        Reaction mechanisms

        # Physical Chemistry
        Thermodynamics
        Equilibrium
    """
    text: str
    section: str = ""   # default section if no ## headers in text


class CoverageSectionSummary(BaseModel):
    section:        str
    total:          int
    studied:        int
    coverage_pct:   float


class CoverageResponse(BaseModel):
    syllabus_id:   int
    syllabus_name: str
    total_items:   int
    studied_items: int
    overall_pct:   float
    sections:      List[CoverageSectionSummary]


# ── Helpers ───────────────────────────────────────────────────

def _parse_bulk_text(text: str, default_section: str = "") -> list[dict]:
    """
    Parse pasted syllabus text into a list of item dicts.

    Lines beginning with ``#`` (one or more hashes) are section headers.
    All other non-empty lines are topic names.

    Returns list of dicts with keys: ``section``, ``topic_name``, ``order_index``.
    """
    items: list[dict] = []
    current_section = default_section
    order = 0

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            # Strip leading #s and whitespace
            current_section = line.lstrip("#").strip()
        else:
            items.append({
                "section":     current_section,
                "topic_name":  line,
                "order_index": order,
            })
            order += 1

    return items


# ── Routes ────────────────────────────────────────────────────

@router.get("/", response_model=List[SyllabusResponse])
async def list_syllabi(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all syllabi owned by the authenticated user."""
    result = await db.execute(
        select(Syllabus)
        .where(Syllabus.user_id == current_user.id)
        .order_by(Syllabus.created_at.desc())
    )
    syllabi = result.scalars().all()

    # Attach item counts
    out = []
    for s in syllabi:
        count_result = await db.execute(
            select(func.count()).where(SyllabusItem.syllabus_id == s.id)
        )
        count = count_result.scalar() or 0
        out.append(SyllabusResponse(
            id=s.id, name=s.name, exam_board=s.exam_board,
            level=s.level, created_at=s.created_at, item_count=count,
        ))
    return out


@router.post("/", response_model=SyllabusResponse, status_code=201)
async def create_syllabus(
    body: SyllabusCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new empty syllabus."""
    s = Syllabus(
        user_id=current_user.id,
        name=body.name.strip(),
        exam_board=body.exam_board.strip(),
        level=body.level.strip(),
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return SyllabusResponse(
        id=s.id, name=s.name, exam_board=s.exam_board,
        level=s.level, created_at=s.created_at, item_count=0,
    )


@router.delete("/{syllabus_id}", status_code=200)
async def delete_syllabus(
    syllabus_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a syllabus and cascade-delete all its items."""
    result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.user_id == current_user.id,
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Syllabus not found.")
    await db.delete(s)
    await db.commit()
    return {"deleted": syllabus_id}


@router.get("/{syllabus_id}/items", response_model=List[SyllabusItemResponse])
async def list_items(
    syllabus_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all items in a syllabus, annotated with coverage data."""
    # Verify ownership
    syl_result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.user_id == current_user.id,
        )
    )
    if not syl_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Syllabus not found.")

    items_result = await db.execute(
        select(SyllabusItem)
        .where(SyllabusItem.syllabus_id == syllabus_id)
        .order_by(SyllabusItem.order_index)
    )
    items = items_result.scalars().all()

    # Build topic lookup: lower(name) → confidence_score
    topics_result = await db.execute(
        select(Topic).where(Topic.user_id == current_user.id)
    )
    topic_confidence: dict[str, float] = {
        t.name.lower(): t.confidence_score
        for t in topics_result.scalars().all()
    }

    return [
        SyllabusItemResponse(
            id=item.id,
            syllabus_id=item.syllabus_id,
            section=item.section,
            topic_name=item.topic_name,
            order_index=item.order_index,
            confidence=topic_confidence.get(item.topic_name.lower(), 0.0),
            studied=item.topic_name.lower() in topic_confidence,
        )
        for item in items
    ]


@router.post("/{syllabus_id}/items", status_code=201)
async def import_items(
    syllabus_id: int,
    body: BulkImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Bulk-import syllabus items from pasted text.

    Lines beginning with ``#`` become section headers.
    All other non-empty lines become topic entries.
    Returns the number of items created.
    """
    syl_result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.user_id == current_user.id,
        )
    )
    if not syl_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Syllabus not found.")

    # Get current max order_index so new items append after existing ones
    max_idx_result = await db.execute(
        select(func.max(SyllabusItem.order_index))
        .where(SyllabusItem.syllabus_id == syllabus_id)
    )
    base_idx = (max_idx_result.scalar() or -1) + 1

    parsed = _parse_bulk_text(body.text, default_section=body.section)
    for p in parsed:
        db.add(SyllabusItem(
            syllabus_id=syllabus_id,
            user_id=current_user.id,
            section=p["section"],
            topic_name=p["topic_name"],
            order_index=base_idx + p["order_index"],
        ))

    await db.commit()
    return {"created": len(parsed)}


@router.delete("/{syllabus_id}/items/{item_id}", status_code=200)
async def delete_item(
    syllabus_id: int,
    item_id:     int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete one syllabus item."""
    result = await db.execute(
        select(SyllabusItem).where(
            SyllabusItem.id == item_id,
            SyllabusItem.syllabus_id == syllabus_id,
            SyllabusItem.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found.")
    await db.delete(item)
    await db.commit()
    return {"deleted": item_id}


@router.get("/{syllabus_id}/coverage", response_model=CoverageResponse)
async def get_coverage(
    syllabus_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return coverage statistics for a syllabus.

    An item is "studied" if a ``Topic`` with the same name (case-insensitive)
    exists for this user and has confidence_score > 0.
    """
    syl_result = await db.execute(
        select(Syllabus).where(
            Syllabus.id == syllabus_id,
            Syllabus.user_id == current_user.id,
        )
    )
    syl = syl_result.scalar_one_or_none()
    if not syl:
        raise HTTPException(status_code=404, detail="Syllabus not found.")

    items_result = await db.execute(
        select(SyllabusItem).where(SyllabusItem.syllabus_id == syllabus_id)
    )
    items = items_result.scalars().all()

    topics_result = await db.execute(
        select(Topic).where(Topic.user_id == current_user.id, Topic.confidence_score > 0)
    )
    studied_names: set[str] = {t.name.lower() for t in topics_result.scalars().all()}

    # Group by section
    section_data: dict[str, dict] = {}
    for item in items:
        sec = item.section or "General"
        if sec not in section_data:
            section_data[sec] = {"total": 0, "studied": 0}
        section_data[sec]["total"] += 1
        if item.topic_name.lower() in studied_names:
            section_data[sec]["studied"] += 1

    sections = [
        CoverageSectionSummary(
            section=sec,
            total=d["total"],
            studied=d["studied"],
            coverage_pct=round(d["studied"] / d["total"] * 100, 1) if d["total"] else 0.0,
        )
        for sec, d in section_data.items()
    ]

    total   = sum(s.total   for s in sections)
    studied = sum(s.studied for s in sections)
    return CoverageResponse(
        syllabus_id=syl.id,
        syllabus_name=syl.name,
        total_items=total,
        studied_items=studied,
        overall_pct=round(studied / total * 100, 1) if total else 0.0,
        sections=sections,
    )
