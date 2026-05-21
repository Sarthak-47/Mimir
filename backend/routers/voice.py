"""
Mimir — Voice Router.

Endpoints
---------
GET  /api/voice/status      — model readiness / download progress
POST /api/voice/transcribe  — audio blob → transcript text (STT)
POST /api/voice/speak       — text → WAV audio bytes (TTS)

All endpoints require a valid JWT (standard Mimir auth).
STT and TTS run in thread-pool workers so the async event loop is not blocked.
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field

from routers.users import get_current_user
from memory.database import User

log    = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TranscribeResponse(BaseModel):
    text:     str
    language: str


class SpeakRequest(BaseModel):
    text:  str             = Field(..., min_length=1, max_length=4000)
    voice: str             = Field(default="bm_lewis")
    speed: float           = Field(default=1.3, ge=0.5, le=2.0)


class VoiceStatusResponse(BaseModel):
    whisper:  str            # missing | downloading | ready | error
    kokoro:   str            # missing | downloading | ready | error
    progress: int            # 0-100 overall
    error:    str | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", response_model=VoiceStatusResponse)
async def voice_status(_: User = Depends(get_current_user)):
    """Return current readiness of the STT and TTS models.

    The frontend polls this on load to decide whether to show the
    VoiceSetupBanner and to enable/disable the mic and speaker buttons.
    """
    from voice.manager import get_status
    return get_status()


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    audio: UploadFile = File(..., description="Audio blob from MediaRecorder (WebM/WAV)"),
    _: User = Depends(get_current_user),
):
    """Transcribe an audio recording to text using faster-whisper base.en.

    Accepts any format supported by PyAV — the browser's default WebM/Opus
    output from the MediaRecorder API works out of the box.

    Returns the transcript and the ISO 639-1 language code detected by Whisper.
    Returns 400 for an empty upload, 503 if the model is unavailable.
    """
    from voice.transcribe import transcribe

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio upload")

    try:
        result = await asyncio.to_thread(transcribe, audio_bytes)
    except Exception as exc:
        log.exception("Transcription failed")
        raise HTTPException(status_code=503, detail=f"Transcription error: {exc}") from exc

    return result


@router.post("/speak")
async def speak_text(
    req: SpeakRequest,
    _: User = Depends(get_current_user),
):
    """Synthesise text to speech using kokoro-onnx (voice: bm_lewis by default).

    Returns a raw ``audio/wav`` byte stream.  The frontend plays it by
    creating a blob URL:
    ``new Audio(URL.createObjectURL(new Blob([data], {type:'audio/wav'})))``.

    Returns 400 for empty text, 503 if the model is unavailable or synthesis
    produces no audio.
    """
    from voice.synthesise import synthesise

    try:
        wav_bytes = await asyncio.to_thread(
            synthesise, req.text, req.voice, req.speed
        )
    except Exception as exc:
        log.exception("TTS synthesis failed")
        raise HTTPException(status_code=503, detail=f"TTS error: {exc}") from exc

    if not wav_bytes:
        raise HTTPException(status_code=503, detail="TTS produced no audio — model may still be loading")

    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=speech.wav"},
    )
