"""
Mimir — Application Configuration.

All settings are read from environment variables or a .env file placed next to
this module. Pydantic-settings handles coercion and validation.

Notable behaviour:
- When running as a PyInstaller frozen bundle, DATA_DIR is redirected to
  ``%LOCALAPPDATA%/Mimir/data`` so data survives app updates.
- The singleton ``settings`` object is imported everywhere; never instantiate
  ``Settings`` directly.
"""

import sys
import os
from pydantic_settings import BaseSettings
from pathlib import Path

# ── Base paths ───────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent

# When running as a PyInstaller bundle, store data in %LOCALAPPDATA%\Mimir
# so it survives app updates and lives outside the install directory.
if getattr(sys, "frozen", False):
    DATA_DIR = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Mimir" / "data"
else:
    DATA_DIR = BASE_DIR / "data"

DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """Application settings loaded from environment / .env.

    Attributes:
        app_name: Human-readable name, used in logs and API title.
        debug: Enable SQLAlchemy echo and verbose logging.
        secret_key: HMAC key for JWT signing — change in production.
        algorithm: JWT algorithm (default HS256).
        access_token_expire_minutes: Token TTL (default 1 week).
        database_url: Async SQLite URL for SQLAlchemy.
        chroma_persist_dir: Directory where ChromaDB persists its index.
        ollama_base_url: Base URL of the local Ollama HTTP API.
        ollama_model: Model tag to use for all LLM calls.
        ollama_num_gpu: GPU layers to offload; -1 means Ollama decides.
        ollama_temperature: Sampling temperature for generation.
        ollama_context_length: Context window size passed to Ollama.
        upload_dir: Disk location for uploaded PDFs and images.
        max_upload_size_mb: Hard cap on upload file size.
        sr_high_threshold: Quiz score% at or above which review is in 7 days.
        sr_mid_threshold: Quiz score% for a 3-day review interval.
        sr_low_threshold: Quiz score% for a 1-day review interval.
    """

    # ── App ──────────────────────────────────────────────────
    app_name: str = "Mimir"
    debug: bool = False

    # ── JWT Auth ─────────────────────────────────────────────
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 1 week

    # ── Database ─────────────────────────────────────────────
    database_url: str = f"sqlite+aiosqlite:///{DATA_DIR}/mimir.db"

    # ── ChromaDB ─────────────────────────────────────────────
    chroma_persist_dir: str = str(DATA_DIR / "chroma")

    # ── Ollama ───────────────────────────────────────────────
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3.5:9b"
    # GPU layers to offload. -1 = auto (let Ollama use full GPU).
    # qwen3.5:9b (6.6 GB) fits entirely in 8 GB VRAM, leaving ~1.8 GB
    # free for KV cache. Vision + tools + thinking built in.
    ollama_num_gpu: int = -1
    ollama_temperature: float = 0.7
    ollama_context_length: int = 8192

    # ── File uploads ─────────────────────────────────────────
    upload_dir: str = str(DATA_DIR / "uploads")
    max_upload_size_mb: int = 50

    # ── Spaced repetition ────────────────────────────────────
    sr_high_threshold: int = 80    # score% → review in 7d
    sr_mid_threshold: int = 60     # score% → review in 3d
    sr_low_threshold: int = 40     # score% → review in 1d
    # below low → review in 4h

    class Config:
        env_file = str(BASE_DIR / ".env")
        case_sensitive = False


# Singleton
settings = Settings()

# Ensure upload dir exists
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
