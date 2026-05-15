"""
Mimir — Chat WebSocket Router
WS /ws/chat?token=<jwt>

Accepts: {"message": str, "subject_id": int | null}
Streams: {"type": "token", "content": str}
         {"type": "done"}
         {"type": "tool_data", "tool": str, "data": any}
         {"type": "error", "content": str}
"""

import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger("mimir.chat")
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import (
    AsyncSessionLocal, Conversation, Topic, Subject, User,
)
from memory.vector import add_memory
from agent.loop import run_agent
from routers.users import decode_jwt
from ws_manager import manager

router = APIRouter()


async def _resolve_user(token: str | None, db: AsyncSession) -> User | None:
    """Return the User for the given JWT, or None if invalid / missing."""
    if not token:
        return None
    username = decode_jwt(token)
    if not username:
        return None
    result = await db.execute(select(User).where(User.username == username))
    return result.scalar_one_or_none()


@router.websocket("/chat")
async def ws_chat(
    websocket: WebSocket,
    token: str | None = Query(None),
):
    async with AsyncSessionLocal() as db:
        user = await _resolve_user(token, db)
        if user is None:
            # Reject before accepting — client sees a failed upgrade
            await websocket.close(code=4001)
            return

        await websocket.accept()
        user_id = user.id
        manager.connect(user_id, websocket)

        try:
            while True:
                raw = await websocket.receive_text()
                payload: dict = json.loads(raw)
                user_message: str       = payload.get("message", "").strip()
                subject_id: int | None  = payload.get("subject_id")

                if not user_message:
                    continue

                # ── Fetch conversation history from DB ────────
                result = await db.execute(
                    select(Conversation)
                    .where(Conversation.user_id == user_id)
                    .order_by(Conversation.timestamp.desc())
                    .limit(20)
                )
                rows = list(reversed(result.scalars().all()))
                history = [{"role": r.role, "content": r.content} for r in rows]

                # ── Fetch topic scores for active subject ─────
                topic_scores: list[dict] = []
                subject_name = ""
                if subject_id:
                    subj_result = await db.execute(
                        select(Subject).where(Subject.id == subject_id)
                    )
                    subj = subj_result.scalar_one_or_none()
                    if subj:
                        subject_name = subj.name

                    topics_result = await db.execute(
                        select(Topic).where(
                            Topic.user_id == user_id,
                            Topic.subject_id == subject_id,
                        )
                    )
                    topics = topics_result.scalars().all()
                    topic_scores = [
                        {"name": t.name, "confidence_score": t.confidence_score}
                        for t in topics
                    ]

                # ── Save user message ─────────────────────────
                user_conv = Conversation(
                    user_id=user_id,
                    role="user",
                    content=user_message,
                    subject_id=subject_id,
                )
                db.add(user_conv)
                await db.commit()
                await db.refresh(user_conv)

                # Add to ChromaDB
                add_memory(
                    user_id=user_id,
                    content=user_message,
                    role="user",
                    conversation_id=user_conv.id,
                    subject_id=subject_id,
                )

                # ── Run agent, stream response ────────────────
                # Inner try: agent/LLM errors send an error message but keep
                # the WebSocket open so the user can try again without re-login.
                full_response = ""
                tool_data_raw: str | None = None

                try:
                    async for chunk in run_agent(
                        user_message=user_message,
                        user_id=user_id,
                        conversation_history=history,
                        topic_scores=topic_scores,
                        subject_id=subject_id,
                        subject_name=subject_name,
                    ):
                        # Detect embedded tool data marker
                        if "__TOOL_DATA__:" in chunk:
                            parts = chunk.split("__TOOL_DATA__:", 1)
                            text_part = parts[0]
                            tool_data_raw = parts[1] if len(parts) > 1 else None
                            if text_part:
                                full_response += text_part
                                await websocket.send_text(
                                    json.dumps({"type": "token", "content": text_part})
                                )
                        else:
                            full_response += chunk
                            await websocket.send_text(
                                json.dumps({"type": "token", "content": chunk})
                            )

                    # Send tool data separately if present
                    if tool_data_raw:
                        try:
                            tool_data = json.loads(tool_data_raw)
                            await websocket.send_text(
                                json.dumps({"type": "tool_data", "data": tool_data})
                            )
                        except json.JSONDecodeError:
                            pass

                    await websocket.send_text(json.dumps({"type": "done"}))

                    # ── Save assistant response ───────────────
                    if full_response.strip():
                        assistant_conv = Conversation(
                            user_id=user_id,
                            role="assistant",
                            content=full_response.strip(),
                            subject_id=subject_id,
                        )
                        db.add(assistant_conv)
                        await db.commit()
                        await db.refresh(assistant_conv)

                        add_memory(
                            user_id=user_id,
                            content=full_response.strip(),
                            role="assistant",
                            conversation_id=assistant_conv.id,
                            subject_id=subject_id,
                        )

                except Exception as agent_err:
                    # Agent / Ollama error: show in chat, keep socket alive
                    err_msg = str(agent_err)
                    logger.error("Agent error for user %d: %s", user_id, err_msg)
                    try:
                        await websocket.send_text(
                            json.dumps({"type": "error", "content": err_msg})
                        )
                        await websocket.send_text(json.dumps({"type": "done"}))
                    except Exception:
                        pass

        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            manager.disconnect(user_id, websocket)
