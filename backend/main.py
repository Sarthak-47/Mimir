"""
Mimir — FastAPI Application Entry Point
Starts the API server + WebSocket endpoint + schedules spaced repetition jobs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from config import settings
from memory.database import init_db
from routers import chat, chronicle, files, quiz, users, progress
from scheduler import review_check, streak_update


# ── Scheduler (module-level singleton) ───────────────────────
_scheduler = AsyncIOScheduler(timezone="UTC")


# ── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
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
    _scheduler.start()
    print("[Mimir] Scheduler started — review_check (hourly), streak_update (daily).")

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

# Allow Tauri dev server + production WebView to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "tauri://localhost"],
    allow_credentials=True,
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
    return {"status": "ok", "model": settings.ollama_model}
