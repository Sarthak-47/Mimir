"""
Mimir — Files Router (PDF / Image Upload).

Endpoints:
    POST   /api/files/upload  — validate, save to disk, enqueue background parsing.
    DELETE /api/files/{id}    — remove from disk, ChromaDB, and SQLite.
    GET    /api/files/        — list files for the current user, optionally filtered.

Parsing and indexing happen in a ``BackgroundTask`` so the upload response
is returned immediately without waiting for OCR or PDF extraction to finish.
The ``processed`` flag on the ``File`` record flips to ``True`` when complete.
"""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from memory.database import File as FileModel, User, get_db
from memory.vector import delete_document_memory
from routers.users import get_current_user
from utils.parser import parse_and_index_file

router = APIRouter()

ALLOWED_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
}


# ── Schema ───────────────────────────────────────────────────
class FileResponse(BaseModel):
    """Public representation of an uploaded file record."""
    id: int
    filename: str
    subject_id: int | None
    processed: bool

    class Config:
        from_attributes = True


# ── Upload ───────────────────────────────────────────────────
@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept a PDF or image upload, save it, and enqueue background indexing.

    Raises 400 for unsupported MIME types and 413 when the file exceeds
    ``settings.max_upload_size_mb``. The file is saved with a UUID filename
    to avoid collisions.
    """
    # Validate type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}",
        )

    # Validate size
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size_mb:.1f}MB > {settings.max_upload_size_mb}MB)",
        )

    # Save to disk
    ext         = Path(file.filename or "upload").suffix or ".pdf"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = Path(settings.upload_dir) / unique_name

    async with aiofiles.open(save_path, "wb") as f:
        await f.write(contents)

    # Save metadata to DB
    db_file = FileModel(
        user_id=current_user.id,
        filename=file.filename or unique_name,
        filepath=str(save_path),
        subject_id=subject_id,
        processed=False,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    # Trigger async parsing and indexing (runs after response is sent)
    background_tasks.add_task(
        parse_and_index_file,
        file_id=db_file.id,
        filepath=str(save_path),
        user_id=current_user.id,
        subject_id=subject_id,
        content_type=file.content_type or "",
        filename=file.filename or unique_name,
    )

    return db_file


# ── Delete file ──────────────────────────────────────────────
@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a file record, its disk bytes, and all ChromaDB chunks. Raises 404 if not found."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
        )
    )
    file_row = result.scalar_one_or_none()
    if not file_row:
        raise HTTPException(status_code=404, detail="File not found")

    # Remove from disk (best-effort)
    try:
        fp = Path(file_row.filepath)
        if fp.exists():
            fp.unlink()
    except Exception:
        pass

    # Remove indexed chunks from ChromaDB
    delete_document_memory(user_id=current_user.id, file_id=file_id)

    # Remove from DB
    await db.delete(file_row)
    await db.commit()


# ── List files ───────────────────────────────────────────────
@router.get("/", response_model=list[FileResponse])
async def list_files(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files owned by the current user, newest first, optionally filtered by subject."""
    query = select(FileModel).where(FileModel.user_id == current_user.id)
    if subject_id is not None:
        query = query.where(FileModel.subject_id == subject_id)

    result = await db.execute(query.order_by(FileModel.created_at.desc()))
    return result.scalars().all()
