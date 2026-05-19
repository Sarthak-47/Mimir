"""
Mimir — System Settings Router

GET   /api/system/models    — list models currently available in Ollama
GET   /api/system/settings  — current runtime settings
PATCH /api/system/settings  — update model / temperature / context length

Changes made via PATCH take effect immediately (no restart required) and are
written to DATA_DIR/user_settings.json so they survive app restarts.

Note: settings are instance-wide, not per-user. On a single-user desktop
app this is fine; for a shared server you would move them to the User table.
"""

import asyncio
import json
from pathlib import Path

import ollama as _ollama
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import settings, DATA_DIR
from memory.database import User
from routers.users import get_current_user

router = APIRouter()

_SETTINGS_FILE = Path(str(DATA_DIR)) / "user_settings.json"


# ── Persistence helpers ──────────────────────────────────────

def _load_persisted() -> dict:
    """Load user-overridden settings from DATA_DIR/user_settings.json."""
    try:
        if _SETTINGS_FILE.exists():
            return json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}


def _save_persisted(data: dict) -> None:
    """Write the settings dict atomically to user_settings.json."""
    _SETTINGS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


# ── Schemas ──────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    ollama_model:          str
    ollama_temperature:    float
    ollama_context_length: int
    ollama_base_url:       str


class SettingsUpdate(BaseModel):
    """Partial update — any field left as None is not changed."""
    ollama_model:          str | None = None
    ollama_temperature:    float | None = None
    ollama_context_length: int | None = None


# ── Endpoints ────────────────────────────────────────────────

@router.get("/models")
async def list_models(_: User = Depends(get_current_user)):
    """Return all model names currently available in the local Ollama instance."""
    try:
        client   = _ollama.AsyncClient(host=settings.ollama_base_url)
        response = await asyncio.wait_for(client.list(), timeout=5.0)
        models   = [m.model for m in (response.models or [])]
        return {"models": models}
    except Exception:
        return {"models": []}


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(_: User = Depends(get_current_user)):
    """Return the current runtime settings (may differ from .env if updated at runtime)."""
    return SettingsResponse(
        ollama_model=settings.ollama_model,
        ollama_temperature=settings.ollama_temperature,
        ollama_context_length=settings.ollama_context_length,
        ollama_base_url=settings.ollama_base_url,
    )


@router.patch("/settings", response_model=SettingsResponse)
async def update_settings(
    req: SettingsUpdate,
    _: User = Depends(get_current_user),
):
    """Update runtime settings; changes persist to user_settings.json for next launch."""
    persisted = _load_persisted()

    if req.ollama_model is not None:
        settings.ollama_model = req.ollama_model
        persisted["ollama_model"] = req.ollama_model

    if req.ollama_temperature is not None:
        t = max(0.0, min(1.0, req.ollama_temperature))
        settings.ollama_temperature = t
        persisted["ollama_temperature"] = t

    if req.ollama_context_length is not None:
        ctx = max(512, min(32_768, req.ollama_context_length))
        settings.ollama_context_length = ctx
        persisted["ollama_context_length"] = ctx

    _save_persisted(persisted)

    return SettingsResponse(
        ollama_model=settings.ollama_model,
        ollama_temperature=settings.ollama_temperature,
        ollama_context_length=settings.ollama_context_length,
        ollama_base_url=settings.ollama_base_url,
    )
