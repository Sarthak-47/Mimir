"""
Mimir — FastAPI Application Entry Point
Starts the API server + WebSocket endpoint + schedules spaced repetition jobs.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings
from memory.database import init_db
from routers import chat, files, quiz, users, progress


# ── Lifespan (startup / shutdown) ───────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"[Mimir] Starting {settings.app_name}…")
    await init_db()
    yield
    # Shutdown
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
app.include_router(users.router,    prefix="/api/users",    tags=["Users"])
app.include_router(chat.router,     prefix="/ws",           tags=["Chat"])
app.include_router(files.router,    prefix="/api/files",    tags=["Files"])
app.include_router(quiz.router,     prefix="/api/quiz",     tags=["Quiz"])
app.include_router(progress.router, prefix="/api/progress", tags=["Progress"])


# ── Health check ─────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "model": settings.ollama_model}
