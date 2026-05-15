"""
Mimir — Document Parser
Extracts text from PDFs and images, then indexes chunks into ChromaDB.

Requirements (installed separately):
  pip install pymupdf pytesseract pillow
  # Also install Tesseract binary: https://github.com/UB-Mannheim/tesseract/wiki

Graceful degradation: if either library is absent, that path returns empty
text and the file is still marked processed (no crash).
"""

import re
import logging

from sqlalchemy import select

from memory.database import AsyncSessionLocal, File as FileModel
from memory.vector import add_document_memory

logger = logging.getLogger("mimir.parser")

# ── Optional imports — degrade gracefully if not installed ───
try:
    import fitz  # PyMuPDF
    _HAS_PYMUPDF = True
except ImportError:
    _HAS_PYMUPDF = False
    logger.warning("PyMuPDF not installed — PDF text extraction unavailable.")

try:
    import pytesseract
    from PIL import Image
    # Point pytesseract at the standard Windows install path if not in PATH
    import shutil, os
    if not shutil.which("tesseract"):
        _DEFAULT_TESS = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(_DEFAULT_TESS):
            pytesseract.pytesseract.tesseract_cmd = _DEFAULT_TESS
    _HAS_OCR = True
except ImportError:
    _HAS_OCR = False
    logger.warning("pytesseract / Pillow not installed — image OCR unavailable.")


# ── Text chunking ────────────────────────────────────────────
def _chunk_text(text: str, size: int = 512, overlap: int = 64) -> list[str]:
    """Split normalised text into overlapping character-based chunks.

    Whitespace is first collapsed to single spaces. The default 64-character
    overlap helps ChromaDB maintain context across chunk boundaries.

    Args:
        text: Raw extracted text (may contain newlines and multiple spaces).
        size: Target chunk size in characters.
        overlap: Number of characters shared between adjacent chunks.

    Returns:
        List of non-empty chunk strings, or an empty list if ``text`` is blank.
    """
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        chunks.append(text[start : start + size])
        start += size - overlap
    return chunks


# ── Extractors ───────────────────────────────────────────────
def _extract_pdf(filepath: str) -> str:
    """Extract all text from a PDF using PyMuPDF. Returns empty string if unavailable."""
    if not _HAS_PYMUPDF:
        return ""
    try:
        doc = fitz.open(filepath)
        pages = [page.get_text() for page in doc]
        doc.close()
        return "\n".join(pages)
    except Exception as e:
        logger.error("PDF extraction failed for %s: %s", filepath, e)
        return ""


def _extract_image(filepath: str) -> str:
    """Run Tesseract OCR on an image file. Returns empty string if unavailable."""
    if not _HAS_OCR:
        return ""
    try:
        img = Image.open(filepath)
        return pytesseract.image_to_string(img)
    except Exception as e:
        logger.error("OCR failed for %s: %s", filepath, e)
        return ""


# ── Main async task ──────────────────────────────────────────
async def parse_and_index_file(
    file_id:      int,
    filepath:     str,
    user_id:      int,
    subject_id:   int | None,
    content_type: str,
) -> None:
    """
    Background task: extract text → chunk → store in ChromaDB → mark processed.

    Called by FastAPI BackgroundTasks immediately after a successful upload.
    Runs in the same process, after the HTTP response has been sent.
    """
    logger.info("Parsing file %s (id=%d, type=%s)", filepath, file_id, content_type)

    # ── Extract ──────────────────────────────────────────────
    if "pdf" in content_type:
        text = _extract_pdf(filepath)
    else:
        text = _extract_image(filepath)

    # ── Index chunks ─────────────────────────────────────────
    if text.strip():
        chunks = _chunk_text(text)
        logger.info("Indexing %d chunks for file %d", len(chunks), file_id)
        for idx, chunk in enumerate(chunks):
            try:
                add_document_memory(
                    user_id=user_id,
                    content=chunk,
                    file_id=file_id,
                    chunk_idx=idx,
                    subject_id=subject_id,
                )
            except Exception as e:
                logger.error("Failed to index chunk %d: %s", idx, e)
    else:
        logger.warning("No text extracted from file %d — check library install.", file_id)

    # ── Mark processed ───────────────────────────────────────
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(FileModel).where(FileModel.id == file_id)
        )
        file_row = result.scalar_one_or_none()
        if file_row:
            file_row.processed = True
            await db.commit()
            logger.info("File %d marked as processed.", file_id)
