"""
Mimir — Chronicle Router
GET /api/chronicle     — paginated conversation history for the current user
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
    id:         int
    role:       str
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
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.timestamp.asc())
        .offset(offset)
        .limit(limit)
    )
    return result.scalars().all()
