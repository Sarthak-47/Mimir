"""
Mimir — Speech-to-Text via faster-whisper.

Pipeline
--------
1. Receive raw audio bytes from the browser (WebM/Opus via MediaRecorder).
2. Decode + resample to float32 mono 16 kHz via PyAV (no external ffmpeg needed —
   PyAV bundles its own FFmpeg binaries on Windows).
3. Run faster-whisper with VAD filtering to skip silent regions.
4. Return {"text": str, "language": str}.
"""

import io
import logging
import numpy as np

log = logging.getLogger(__name__)

TARGET_SR = 16_000   # faster-whisper expects 16 kHz mono float32


def _decode_audio(audio_bytes: bytes) -> np.ndarray:
    """Decode any PyAV-supported format → float32 mono array at 16 kHz.

    Handles WebM/Opus (browser default), WAV, MP4, OGG, and more.
    Returns a 1-second silence array if the input yields no audio frames.
    """
    import av

    container  = av.open(io.BytesIO(audio_bytes))
    resampler  = av.AudioResampler(format="fltp", layout="mono", rate=TARGET_SR)

    chunks: list[np.ndarray] = []
    try:
        for frame in container.decode(audio=0):
            for resampled in resampler.resample(frame):
                # fltp = float planar → shape (1, n_samples); take channel 0
                chunks.append(resampled.to_ndarray()[0])
        # flush resampler
        for resampled in resampler.resample(None):
            chunks.append(resampled.to_ndarray()[0])
    finally:
        container.close()

    if not chunks:
        log.warning("No audio frames decoded — returning silence")
        return np.zeros(TARGET_SR, dtype=np.float32)

    return np.concatenate(chunks).astype(np.float32)


def transcribe(audio_bytes: bytes) -> dict:
    """Transcribe audio bytes to text.

    Args:
        audio_bytes: Raw audio from the browser (WebM/Opus, WAV, …).

    Returns:
        {"text": str, "language": str}  — text is stripped of leading/
        trailing whitespace; language is the ISO 639-1 code detected by
        Whisper (usually "en" for English input).
    """
    from voice.manager import get_transcriber

    audio = _decode_audio(audio_bytes)
    model = get_transcriber()

    segments, info = model.transcribe(
        audio,
        beam_size=5,
        language="en",           # force English — avoids mis-detection on short clips
        vad_filter=True,         # skip silent / noise-only segments
        vad_parameters={"min_silence_duration_ms": 300},
    )

    text = " ".join(seg.text.strip() for seg in segments).strip()
    log.debug("Transcribed %d bytes → %r (%s)", len(audio_bytes), text[:60], info.language)
    return {"text": text, "language": info.language}
