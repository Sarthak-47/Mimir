"""
Mimir — Chronicle Router.

Endpoint:
    GET /api/chronicle  — return paginated conversation history for the current
                          user in chronological order (oldest first).

Used by the Chronicle view to replay past study sessions. Supports ``limit``
(max 500) and ``offset`` for pagination.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import Conversation, User, get_db
from routers.users import get_current_user

router = APIRouter()


class ConversationRow(BaseModel):
    """One conversation turn as surfaced by the Chronicle endpoint."""
    id:         int
    role:       str            # 'user' | 'assistant'
    content:    str
    subject_id: int | None
    timestamp:  datetime

    class Config:
        from_attributes = True


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
