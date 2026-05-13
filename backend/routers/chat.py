"""
Mimir — Chat WebSocket Router
WS /ws/chat

Accepts: {"message": str, "subject_id": int | null}
Streams: {"type": "token", "content": str}
         {"type": "done"}
         {"type": "tool_data", "tool": str, "data": any}
"""

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import (
    AsyncSessionLocal, Conversation, Topic, Subject,
)
from memory.vector import add_memory, query_memory
from agent.loop import run_agent

router = APIRouter()


@router.websocket("/chat")
async def ws_chat(websocket: WebSocket):
    await websocket.accept()
    user_id = 1  # TODO: parse JWT from query param once auth is wired

    async with AsyncSessionLocal() as db:
        try:
            while True:
                raw = await websocket.receive_text()
                payload: dict = json.loads(raw)
                user_message: str  = payload.get("message", "").strip()
                subject_id: int | None = payload.get("subject_id")

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
                full_response = ""
                tool_data_raw: str | None = None

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

                # ── Save assistant response ───────────────────
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

        except WebSocketDisconnect:
            pass
        except Exception as e:
            await websocket.send_text(
                json.dumps({"type": "error", "content": str(e)})
            )
