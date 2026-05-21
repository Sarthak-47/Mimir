"""
Mimir — Chronicle Router.

Endpoints:
    GET  /api/chronicle              — paginated conversation history (oldest first).
    GET  /api/chronicle/sessions     — conversations grouped into sessions by 2-hour gaps.
    DELETE /api/chronicle/messages   — delete a list of conversation rows by ID.

Used by the Chronicle view and the Sidebar session history panel.
"""

from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete

from memory.database import Conversation, User, get_db
from routers.users import get_current_user

router = APIRouter()

_SESSION_GAP_HOURS = 2   # gap that defines a new session boundary


class ConversationRow(BaseModel):
    """One conversation turn as surfaced by the Chronicle endpoint."""
    id:         int
    role:       str            # 'user' | 'assistant'
    content:    str
    subject_id: int | None
    timestamp:  datetime

    class Config:
        from_attributes = True


class SessionGroup(BaseModel):
    """A group of consecutive conversation turns with no gap > 2 hours."""
    session_id: str
    start_time: datetime
    subject_id: int | None
    turn_count: int
    preview:    str
    messages:   list[ConversationRow]


@router.get("/", response_model=list[ConversationRow])
async def list_conversations(
    limit:  int = Query(default=100, le=500),
    offset: int = Query(default=0,   ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a paginated slice of conversation history ordered chronologically."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.timestamp.asc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/sessions", response_model=list[SessionGroup])
async def list_sessions(
    subject_id: int | None = Query(default=None),
    limit:      int        = Query(default=50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return conversations grouped into sessions separated by > 2-hour gaps.

    Optionally filter to a single subject. Sessions are ordered newest-first so
    the sidebar shows the most recent conversations at the top.
    """
    q = (
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.timestamp.asc())
        .limit(1000)
    )
    if subject_id is not None:
        q = q.where(Conversation.subject_id == subject_id)

    result = await db.execute(q)
    convs = result.scalars().all()

    if not convs:
        return []

    # Partition into sessions by time gap
    raw_sessions: list[list[Conversation]] = [[convs[0]]]
    for c in convs[1:]:
        gap = c.timestamp - raw_sessions[-1][-1].timestamp
        if gap > timedelta(hours=_SESSION_GAP_HOURS):
            raw_sessions.append([c])
        else:
            raw_sessions[-1].append(c)

    # Build response objects, newest-first, capped at limit
    groups: list[SessionGroup] = []
    for i, session in enumerate(reversed(raw_sessions)):
        if len(groups) >= limit:
            break
        subj = next((c.subject_id for c in session if c.subject_id), None)
        groups.append(SessionGroup(
            session_id=f"s{session[0].id}",
            start_time=session[0].timestamp,
            subject_id=subj,
            turn_count=len(session),
            preview=session[0].content[:100],
            messages=[
                ConversationRow(
                    id=c.id, role=c.role, content=c.content,
                    subject_id=c.subject_id, timestamp=c.timestamp,
                )
                for c in session
            ],
        ))

    return groups


# ── Delete session ────────────────────────────────────────────

class DeleteMessagesRequest(BaseModel):
    """Payload for bulk-deleting conversation rows."""
    ids: List[int]


@router.delete("/messages", status_code=200)
async def delete_messages(
    body: DeleteMessagesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a set of conversation turns by ID.

    Only rows belonging to the authenticated user are deleted — other IDs
    are silently ignored for security.  The frontend passes the full ``ids``
    list from the session it wants to remove.

    Returns:
        ``{"deleted": N}`` where N is the number of rows actually removed.
    """
    if not body.ids:
        return {"deleted": 0}

    result = await db.execute(
        sa_delete(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            Conversation.id.in_(body.ids),
        )
    )
    await db.commit()
    return {"deleted": result.rowcount}
