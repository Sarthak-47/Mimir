"""
Mimir — Voice Model Manager.

Handles lazy-loading and first-run downloading of:
  • faster-whisper base.en  (~290 MB) for STT
  • kokoro-onnx bm_lewis    (~310 MB) for TTS

Models are stored under DATA_DIR/models/ and survive app updates.
Thread-safe double-checked locking ensures each model is loaded once.

Public API
----------
get_transcriber()  → WhisperModel singleton
get_synthesiser()  → Kokoro singleton
get_status()       → {"whisper": str, "kokoro": str, "progress": int, "error": str|None}
prefetch_models()  → kick off background download/load on startup
"""

import threading
import logging
from pathlib import Path

from config import DATA_DIR

log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────

MODELS_DIR  = DATA_DIR / "models"
WHISPER_DIR = MODELS_DIR / "whisper"
KOKORO_DIR  = MODELS_DIR / "kokoro"

WHISPER_MODEL_SIZE = "base.en"

KOKORO_RELEASE_BASE = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
)
# int8 quantised model — best CPU throughput, 92 MB
KOKORO_FILES = [
    ("kokoro-v1.0.int8.onnx", f"{KOKORO_RELEASE_BASE}/kokoro-v1.0.int8.onnx"),
    ("voices-v1.0.bin",        f"{KOKORO_RELEASE_BASE}/voices-v1.0.bin"),
]


# ── Status ────────────────────────────────────────────────────────────────────

_status: dict = {
    "whisper":  "missing",   # missing | downloading | ready | error
    "kokoro":   "missing",   # missing | downloading | ready | error
    "progress": 0,
    "error":    None,
}
_status_lock = threading.Lock()


def _set(**kwargs) -> None:
    with _status_lock:
        _status.update(kwargs)


def get_status() -> dict:
    with _status_lock:
        return dict(_status)


# ── Singletons ────────────────────────────────────────────────────────────────

_whisper        = None
_kokoro         = None
_whisper_lock   = threading.Lock()
_kokoro_lock    = threading.Lock()


# ── Kokoro download ───────────────────────────────────────────────────────────

def _ensure_kokoro_files() -> tuple[Path, Path]:
    """Download kokoro ONNX model and voices file if not present.

    Files are fetched from GitHub Releases (no auth required).
    Returns (onnx_path, voices_path).
    """
    import urllib.request

    KOKORO_DIR.mkdir(parents=True, exist_ok=True)
    result_paths: list[Path] = []

    for i, (filename, url) in enumerate(KOKORO_FILES):
        dest = KOKORO_DIR / filename
        if dest.exists():
            log.info("kokoro file already cached: %s", filename)
            result_paths.append(dest)
            continue

        log.info("Downloading kokoro file: %s …", filename)
        _set(kokoro="downloading", progress=int(i / len(KOKORO_FILES) * 50))
        urllib.request.urlretrieve(url, dest)
        log.info("Downloaded %s (%.1f MB)", filename, dest.stat().st_size / 1_048_576)
        result_paths.append(dest)

    return result_paths[0], result_paths[1]


# ── Public accessors ──────────────────────────────────────────────────────────

def get_transcriber():
    """Return the loaded WhisperModel singleton.

    Downloads the model on first call (~290 MB one-time download).
    Thread-safe via double-checked locking.
    """
    global _whisper
    if _whisper is not None:
        return _whisper

    with _whisper_lock:
        if _whisper is not None:          # another thread may have loaded it
            return _whisper

        WHISPER_DIR.mkdir(parents=True, exist_ok=True)
        _set(whisper="downloading", progress=0)
        log.info("Loading faster-whisper %s …", WHISPER_MODEL_SIZE)

        try:
            from faster_whisper import WhisperModel
            _whisper = WhisperModel(
                WHISPER_MODEL_SIZE,
                device="cpu",
                compute_type="int8",       # quantised for CPU speed
                download_root=str(WHISPER_DIR),
            )
            _set(whisper="ready")
            log.info("faster-whisper ready (%s)", WHISPER_MODEL_SIZE)
        except Exception as exc:
            _set(whisper="error", error=str(exc))
            log.error("faster-whisper load failed: %s", exc)
            raise

        return _whisper


def get_synthesiser():
    """Return the loaded Kokoro singleton.

    Downloads model files on first call (~310 MB one-time download).
    Thread-safe via double-checked locking.
    """
    global _kokoro
    if _kokoro is not None:
        return _kokoro

    with _kokoro_lock:
        if _kokoro is not None:
            return _kokoro

        _set(kokoro="downloading", progress=0)
        log.info("Loading kokoro-onnx …")

        try:
            from kokoro_onnx import Kokoro
            onnx_path, voices_path = _ensure_kokoro_files()
            _set(kokoro="downloading", progress=80)
            _kokoro = Kokoro(str(onnx_path), str(voices_path))
            _set(kokoro="ready", progress=100)
            log.info("kokoro-onnx ready")
        except Exception as exc:
            _set(kokoro="error", error=str(exc))
            log.error("kokoro-onnx load failed: %s", exc)
            raise

        return _kokoro


def prefetch_models() -> None:
    """Kick off background model loading at app startup.

    Both models load in daemon threads so startup is non-blocking.
    The frontend polls GET /api/voice/status to track readiness.
    """
    def _load_whisper():
        try:
            get_transcriber()
        except Exception as exc:
            log.error("Whisper prefetch failed: %s", exc)

    def _load_kokoro():
        try:
            get_synthesiser()
        except Exception as exc:
            log.error("Kokoro prefetch failed: %s", exc)

    threading.Thread(target=_load_whisper, daemon=True, name="whisper-prefetch").start()
    threading.Thread(target=_load_kokoro,  daemon=True, name="kokoro-prefetch").start()
    log.info("Voice model prefetch started in background")
