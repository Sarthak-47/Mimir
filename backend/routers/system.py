"""
Mimir — System configuration router.

Exposes:
  GET  /api/system/models   — list available Ollama models
  GET  /api/system/settings — current runtime settings
  PATCH /api/system/settings — update model / temperature / context_length
"""

import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import ollama

from config import settings, DATA_DIR
from routers.users import get_current_user   # reuse JWT dependency

router = APIRouter()

_SETTINGS_FILE = Path(str(DATA_DIR)) / "user_settings.json"


# ── Response schemas ──────────────────────────────────────────
class SettingsResponse(BaseModel):
    ollama_model: str
    ollama_temperature: float
    ollama_context_length: int
    ollama_base_url: str


class SettingsPatch(BaseModel):
    ollama_model: Optional[str] = None
    ollama_temperature: Optional[float] = None
    ollama_context_length: Optional[int] = None


# ── Endpoints ─────────────────────────────────────────────────
@router.get("/models")
async def list_models(_user=Depends(get_current_user)):
    """Return all models available in the local Ollama instance."""
    try:
        client = ollama.AsyncClient(host=settings.ollama_base_url)
        resp = await asyncio.wait_for(client.list(), timeout=5.0)
        return [
            {"name": m.model, "size_gb": round((m.size or 0) / 1e9, 1)}
            for m in resp.models
        ]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}")


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(_user=Depends(get_current_user)):
    return SettingsResponse(
        ollama_model=settings.ollama_model,
        ollama_temperature=settings.ollama_temperature,
        ollama_context_length=settings.ollama_context_length,
        ollama_base_url=settings.ollama_base_url,
    )


@router.patch("/settings", response_model=SettingsResponse)
async def patch_settings(body: SettingsPatch, _user=Depends(get_current_user)):
    """Update runtime settings and persist them to user_settings.json."""
    if body.ollama_model is not None:
        settings.ollama_model = body.ollama_model

    if body.ollama_temperature is not None:
        settings.ollama_temperature = max(0.0, min(1.0, body.ollama_temperature))

    if body.ollama_context_length is not None:
        settings.ollama_context_length = max(512, min(32768, body.ollama_context_length))

    # Persist to disk so restarts keep the changes
    try:
        existing: dict = {}
        if _SETTINGS_FILE.exists():
            existing = json.loads(_SETTINGS_FILE.read_text(encoding="utf-8"))
        existing.update({
            "ollama_model": settings.ollama_model,
            "ollama_temperature": settings.ollama_temperature,
            "ollama_context_length": settings.ollama_context_length,
        })
        _SETTINGS_FILE.write_text(json.dumps(existing, indent=2), encoding="utf-8")
    except Exception:
        pass  # non-fatal — settings are already updated in memory

    return SettingsResponse(
        ollama_model=settings.ollama_model,
        ollama_temperature=settings.ollama_temperature,
        ollama_context_length=settings.ollama_context_length,
        ollama_base_url=settings.ollama_base_url,
    )
