"""
Mimir — FastAPI Application Entry Point.

Composes the full API surface from individual routers, configures CORS for both
the Vite dev server and Tauri WebView origins, and registers two APScheduler
background jobs (hourly review reminder + daily streak recalculation).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from memory.database import init_db
from routers import chat, chronicle, examiner, files, quiz, users, progress, tutor, system, syllabus, voice
from scheduler import review_check, streak_update
from memory.summarizer import summarize_old_sessions


# ── Scheduler (module-level singleton) ───────────────────────
_scheduler = AsyncIOScheduler(timezone="UTC")


# ── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context: initialise DB and scheduler on startup, shut down cleanly."""
    # Startup
    print(f"[Mimir] Starting {settings.app_name}…")
    await init_db()

    # Kick off voice model loading in background (non-blocking)
    from voice.manager import prefetch_models
    prefetch_models()

    # Register scheduled jobs
    _scheduler.add_job(
        review_check,
        trigger="interval",
        hours=1,
        id="review_check",
        replace_existing=True,
    )
    _scheduler.add_job(
        streak_update,
        trigger="cron",
        hour=0,
        minute=5,       # runs 00:05 UTC daily
        id="streak_update",
        replace_existing=True,
    )
    _scheduler.add_job(
        summarize_old_sessions,
        trigger="cron",
        hour=2,
        minute=0,       # runs 02:00 UTC daily — compresses sessions > 7 days old
        id="memory_summarization",
        replace_existing=True,
    )
    _scheduler.start()
    print("[Mimir] Scheduler started — review_check (hourly), streak_update (daily), memory_summarization (02:00 UTC).")

    yield

    # Shutdown
    _scheduler.shutdown(wait=False)
    print("[Mimir] Shutting down…")


# ── App ──────────────────────────────────────────────────────
app = FastAPI(
    title="Mimir API",
    description="Local study agent backend — Norse-themed wisdom engine",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow Tauri dev server + production WebView to connect.
# Tauri v2 on Windows uses http://tauri.localhost (WebView2);
# Tauri v1 and macOS used tauri://localhost.
app.add_middleware(
    CORSMiddleware,
    # Backend binds to 127.0.0.1 only and auth is JWT-based, so CORS is
    # not a meaningful security boundary here. Allow all origins so that
    # Tauri WebView2 (whose exact internal scheme varies by platform/version)
    # can always reach the WebSocket and REST endpoints without a 403.
    allow_origins=["*"],
    allow_credentials=False,  # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────
app.include_router(users.router,     prefix="/api/users",     tags=["Users"])
app.include_router(chat.router,      prefix="/ws",            tags=["Chat"])
app.include_router(files.router,     prefix="/api/files",     tags=["Files"])
app.include_router(quiz.router,      prefix="/api/quiz",      tags=["Quiz"])
app.include_router(progress.router,  prefix="/api/progress",  tags=["Progress"])
app.include_router(chronicle.router, prefix="/api/chronicle", tags=["Chronicle"])
app.include_router(tutor.router,    prefix="/api/tutor",     tags=["Tutor"])
app.include_router(system.router,   prefix="/api/system",    tags=["System"])
app.include_router(examiner.router, prefix="/api/examiner",  tags=["Examiner"])
app.include_router(syllabus.router, prefix="/api/syllabus",  tags=["Syllabus"])
app.include_router(voice.router,    prefix="/api/voice",     tags=["Voice"])


# ── Health check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    """
    Enhanced health probe used by the frontend every 30 s.
    Checks Ollama reachability and model availability.
    Returns:
        status:    "ok" | "degraded"
        ollama_ok: True if Ollama HTTP API responded within 3 s
        model_ok:  True if settings.ollama_model is in the model list
        model:     current model name
        error:     error string or null
    """
    import asyncio as _asyncio
    import ollama as _ollama

    ollama_ok = False
    model_ok  = False
    error_msg = None

    try:
        _c = _ollama.AsyncClient(host=settings.ollama_base_url)
        resp = await _asyncio.wait_for(_c.list(), timeout=3.0)
        ollama_ok = True
        model_ok  = any(
            m.model == settings.ollama_model or
            m.model.split(":")[0] == settings.ollama_model.split(":")[0]
            for m in resp.models
        )
        if not model_ok:
            error_msg = f"Model '{settings.ollama_model}' not found — run: ollama pull {settings.ollama_model}"
    except Exception as exc:
        error_msg = f"Ollama unreachable — run: ollama serve  ({type(exc).__name__})"

    return {
        "status":    "ok" if (ollama_ok and model_ok) else "degraded",
        "model":     settings.ollama_model,
        "ollama_ok": ollama_ok,
        "model_ok":  model_ok,
        "error":     error_msg,
    }
