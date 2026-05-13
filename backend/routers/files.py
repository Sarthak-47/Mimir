"""
Mimir — Files Router (PDF / Image Upload)
POST /api/files/upload
GET  /api/files/
"""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from memory.database import File as FileModel, get_db

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
    id: int
    filename: str
    subject_id: int | None
    processed: bool

    class Config:
        from_attributes = True


# ── Upload ───────────────────────────────────────────────────
@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    subject_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    user_id = 1  # TODO: use auth

    # Validate type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    # Validate size
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(status_code=413, detail=f"File too large ({size_mb:.1f}MB > {settings.max_upload_size_mb}MB)")

    # Save to disk
    ext = Path(file.filename or "upload").suffix or ".pdf"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path   = Path(settings.upload_dir) / unique_name

    async with aiofiles.open(save_path, "wb") as f:
        await f.write(contents)

    # Save metadata to DB
    db_file = FileModel(
        user_id=user_id,
        filename=file.filename or unique_name,
        filepath=str(save_path),
        subject_id=subject_id,
        processed=False,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    # TODO: trigger async PDF parsing job here (APScheduler / BackgroundTasks)

    return db_file


# ── List files ───────────────────────────────────────────────
@router.get("/", response_model=list[FileResponse])
async def list_files(
    subject_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    user_id = 1  # TODO: use auth
    query = select(FileModel).where(FileModel.user_id == user_id)
    if subject_id is not None:
        query = query.where(FileModel.subject_id == subject_id)

    result = await db.execute(query.order_by(FileModel.created_at.desc()))
    return result.scalars().all()
