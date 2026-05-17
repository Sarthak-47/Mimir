"""
Mimir — Chat WebSocket Router.

Endpoint: ``WS /ws/chat?token=<jwt>``

Client sends:
    ``{"message": str, "subject_id": int | null}``

Server streams (one JSON frame per message):
    ``{"type": "token",     "content": str}``      — streaming LLM token
    ``{"type": "done"}``                            — turn complete
    ``{"type": "tool_data", "data": any}``          — structured quiz/flashcard data
    ``{"type": "error",     "content": str}``       — agent error (socket stays open)

The WebSocket loop persists for the lifetime of the connection; multiple
messages can be sent on the same socket without re-authenticating. Errors
inside the agent are caught and reported as ``error`` frames rather than
closing the socket, so the user can retry.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger("mimir.chat")
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import (
    AsyncSessionLocal, Conversation, Topic, Subject, User, TutorSession,
)
from memory.vector import add_memory
from agent.loop import run_agent
from agent.tutor import run_tutor_turn, next_state as tutor_next_state
from routers.users import decode_jwt
from ws_manager import manager

router = APIRouter()


async def _handle_tutor_turn(
    websocket: WebSocket,
    db,
    user_id: int,
    tutor_session_id: int,
    user_message: str,
) -> None:
    """Route one WebSocket message through the tutor state machine."""
    from datetime import datetime, timezone

    result = await db.execute(
        select(TutorSession).where(
            TutorSession.id == tutor_session_id,
            TutorSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        await websocket.send_text(json.dumps({"type": "error", "content": "Tutor session not found."}))
        await websocket.send_text(json.dumps({"type": "done"}))
        return

    # Fetch recent tutor conversation (messages tagged with this session)
    conv_result = await db.execute(
        select(Conversation)
        .where(
            Conversation.user_id == user_id,
            Conversation.subject_id == session.subject_id,
        )
        .order_by(Conversation.timestamp.desc())
        .limit(20)
    )
    history = [{"role": r.role, "content": r.content}
               for r in reversed(conv_result.scalars().all())]

    # Add user message to history for this turn
    if user_message:
        history.append({"role": "user", "content": user_message})
        user_conv = Conversation(
            user_id=user_id, role="user", content=user_message,
            subject_id=session.subject_id,
        )
        db.add(user_conv)
        await db.commit()

    # Build quiz_result context for DEBRIEF if needed
    quiz_result = None
    if session.state == "QUIZ" and session.quiz_score is not None:
        quiz_result = {"score": session.quiz_score, "total": session.quiz_total or 3}

    _ping_task = asyncio.create_task(_keepalive(websocket))
    full_response = ""
    quiz_json: str | None = None

    try:
        async for chunk in run_tutor_turn(
            state=session.state,
            topic_name=session.topic_name,
            history=history,
            quiz_result=quiz_result,
        ):
            if chunk.startswith("__TUTOR_STATE__:"):
                state_name = chunk.split(":", 1)[1]
                await websocket.send_text(json.dumps({"type": "tutor_state", "state": state_name}))
            elif chunk.startswith("__TUTOR_QUIZ__:"):
                quiz_json = chunk.split(":", 1)[1]
                await websocket.send_text(json.dumps({"type": "tutor_quiz", "data": json.loads(quiz_json)}))
            else:
                full_response += chunk
                await websocket.send_text(json.dumps({"type": "token", "content": chunk}))

        await websocket.send_text(json.dumps({"type": "done"}))

        # Advance session state
        new_state = tutor_next_state(session.state)
        if new_state:
            session.state = new_state
            if new_state == "DEBRIEF":
                session.completed_at = datetime.now(timezone.utc)
            await db.commit()
            # Notify frontend of new state
            await websocket.send_text(json.dumps({"type": "tutor_state", "state": new_state}))

        # Save assistant response
        if full_response.strip():
            asst_conv = Conversation(
                user_id=user_id, role="assistant", content=full_response.strip(),
                subject_id=session.subject_id,
            )
            db.add(asst_conv)
            await db.commit()

    except Exception as exc:
        logger.error("Tutor turn error: %s", exc)
        await websocket.send_text(json.dumps({"type": "error", "content": str(exc)}))
        await websocket.send_text(json.dumps({"type": "done"}))
    finally:
        _ping_task.cancel()


async def _keepalive(websocket: WebSocket, interval: float = 8.0) -> None:
    """Send a no-op ping frame every *interval* seconds.

    Keeps the browser WebSocket alive during the initial non-streaming
    Ollama reasoning call, which can take 30-60 s on local hardware.
    The frontend ignores frames with ``type == "ping"``.
    """
    while True:
        await asyncio.sleep(interval)
        try:
            await websocket.send_text(json.dumps({"type": "ping"}))
        except Exception:
            break


async def _resolve_user(token: str | None, db: AsyncSession) -> User | None:
    """Decode a JWT query-param token and return the matching User, or None.

    Used by the WebSocket endpoint where standard OAuth2 Bearer headers are
    unavailable; the token is passed as a ``?token=`` query parameter instead.
    """
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
    """Persistent WebSocket chat endpoint.

    Validates the JWT before accepting the upgrade. On each incoming message:
    saves the user turn to SQLite + ChromaDB, runs the ReAct agent, streams
    tokens back as ``token`` frames, sends tool data as a ``tool_data`` frame,
    and saves the completed assistant turn. Agent errors are sent as ``error``
    frames without closing the socket.
    """
    # Accept the WebSocket upgrade FIRST so that any rejection is sent as
    # a proper WS close frame (code 4001) rather than an HTTP 403 response.
    # An HTTP 403 reaches the browser as close code 1006 (abnormal) which
    # the frontend cannot distinguish from a transient network error, so it
    # retries indefinitely instead of redirecting to the login screen.
    await websocket.accept()

    async with AsyncSessionLocal() as db:
        user = await _resolve_user(token, db)
        if user is None:
            await websocket.close(code=4001)
            return

        user_id = user.id
        manager.connect(user_id, websocket)

        try:
            while True:
                raw = await websocket.receive_text()
                payload: dict = json.loads(raw)
                user_message: str       = payload.get("message", "").strip()
                subject_id: int | None  = payload.get("subject_id")
                mode: str               = payload.get("mode", "detailed")
                images: list[str]       = payload.get("images") or []
                tutor_session_id: int | None = payload.get("tutor_session_id")

                if not user_message and not images:
                    continue

                # ── Tutor session turn ────────────────────────
                if tutor_session_id:
                    await _handle_tutor_turn(
                        websocket=websocket,
                        db=db,
                        user_id=user_id,
                        tutor_session_id=tutor_session_id,
                        user_message=user_message,
                    )
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
                        {"id": t.id, "name": t.name, "confidence_score": t.confidence_score}
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

                # Keep the WS alive while the non-streaming reasoning call
                # is in flight (can take 30–60 s on local hardware).
                _ping_task = asyncio.create_task(_keepalive(websocket))
                try:
                    async for chunk in run_agent(
                        user_message=user_message,
                        user_id=user_id,
                        conversation_history=history,
                        topic_scores=topic_scores,
                        subject_id=subject_id,
                        subject_name=subject_name,
                        mode=mode,
                        images=images or None,
                    ):
                        # ── Tool invocation signal ─────────────────────
                        if "__ACTION__:" in chunk:
                            tool_name_sig = chunk.split("__ACTION__:", 1)[1].strip()
                            await websocket.send_text(
                                json.dumps({"type": "tool_action", "tool": tool_name_sig})
                            )
                        # ── Source grounding ───────────────────────────
                        elif "__SOURCES__:" in chunk:
                            sources_raw = chunk.split("__SOURCES__:", 1)[1].strip()
                            try:
                                sources_data = json.loads(sources_raw)
                                if sources_data:
                                    await websocket.send_text(
                                        json.dumps({"type": "sources", "data": sources_data})
                                    )
                            except json.JSONDecodeError:
                                pass
                        # ── Structured tool output (quiz / flashcards) ─
                        elif "__TOOL_DATA__:" in chunk:
                            parts = chunk.split("__TOOL_DATA__:", 1)
                            text_part = parts[0]
                            tool_data_raw = parts[1] if len(parts) > 1 else None
                            if text_part:
                                full_response += text_part
                                await websocket.send_text(
                                    json.dumps({"type": "token", "content": text_part})
                                )
                        # ── Normal streaming token ─────────────────────
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
                finally:
                    _ping_task.cancel()

        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            manager.disconnect(user_id, websocket)
