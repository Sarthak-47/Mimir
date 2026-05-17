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
from routers import chat, chronicle, files, quiz, users, progress
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


# ── Health check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    """Return a simple liveness probe used by the frontend boot-splash to wait for uvicorn."""
    return {"status": "ok", "model": settings.ollama_model}
