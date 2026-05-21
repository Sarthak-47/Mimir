"""
Mimir — Text-to-Speech via kokoro-onnx.

Pipeline
--------
1. Strip markdown symbols so the voice doesn't read `*bold*` or `# headings`.
2. Split text into sentences to keep per-call latency low.
3. Synthesise each sentence with kokoro, appending a short silence gap.
4. Concatenate all chunks and encode as a 16-bit PCM WAV byte stream.

The returned bytes are sent as audio/wav and played in the browser via a
blob URL: ``new Audio(URL.createObjectURL(new Blob([bytes], {type:'audio/wav'})))``.
"""

import io
import re
import logging
import numpy as np

log = logging.getLogger(__name__)

DEFAULT_VOICE = "bm_lewis"   # deep British male — closest to Norse/gruff feel
DEFAULT_SPEED = 1.0
# kokoro v1.0 uses lang codes; en-gb = British English (matches bm_* voices)
DEFAULT_LANG  = "en-gb"
SAMPLE_RATE   = 24_000        # kokoro outputs 24 kHz mono float32

# 150 ms silence between sentences (smoother than abrupt concatenation)
_SILENCE_SAMPLES = int(SAMPLE_RATE * 0.15)


def _strip_markdown(text: str) -> str:
    """Remove common markdown tokens that TTS would vocalise literally."""
    # Remove headers, bold, italic, code fences, inline code, blockquotes, HR
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text)
    text = re.sub(r"_{1,2}(.*?)_{1,2}", r"\1", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"^>+\s?", "", text, flags=re.MULTILINE)
    text = re.sub(r"^-{3,}$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)   # links → label
    return text.strip()


def _split_sentences(text: str) -> list[str]:
    """Split on sentence-ending punctuation; keep non-empty parts."""
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [p.strip() for p in parts if p.strip()]


def synthesise(
    text: str,
    voice: str = DEFAULT_VOICE,
    speed: float = DEFAULT_SPEED,
) -> bytes:
    """Synthesise plain text → WAV bytes (PCM 16-bit, 24 kHz, mono).

    Args:
        text:  Text to speak.  Markdown is stripped automatically.
        voice: Kokoro voice ID (default ``bm_lewis``).
        speed: Playback speed multiplier 0.5–2.0 (default 1.0).

    Returns:
        WAV file as raw bytes ready for an ``audio/wav`` HTTP response.
        Returns ``b""`` if synthesis produces no audio.
    """
    import soundfile as sf
    from voice.manager import get_synthesiser

    clean = _strip_markdown(text)
    if not clean:
        return b""

    sentences = _split_sentences(clean) or [clean]
    kokoro    = get_synthesiser()
    silence   = np.zeros(_SILENCE_SAMPLES, dtype=np.float32)
    chunks: list[np.ndarray] = []

    for sentence in sentences:
        try:
            samples, _sr = kokoro.create(
                sentence,
                voice=voice,
                speed=speed,
                lang=DEFAULT_LANG,
            )
            chunks.append(samples.astype(np.float32))
            chunks.append(silence)
        except Exception as exc:
            log.warning("kokoro skipped sentence %r: %s", sentence[:50], exc)

    if not chunks:
        return b""

    audio = np.concatenate(chunks)
    buf   = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    return buf.getvalue()
