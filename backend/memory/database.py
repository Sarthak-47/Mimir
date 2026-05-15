"""
Mimir — SQLite Database Layer (SQLAlchemy async).

Defines the full ORM schema and async session infrastructure. All models
use ``DeclarativeBase`` with ``mapped_column`` typing for mypy compatibility.

Schema overview:
- ``User``         — account record; owns subjects, conversations, and files.
- ``Subject``      — a named study discipline (e.g. "Machine Learning").
- ``Topic``        — a trackable concept within a subject with SR fields.
- ``QuizSession``  — one completed quiz attempt; drives SR and streak logic.
- ``File``         — uploaded PDF/image metadata; content lives on disk + ChromaDB.
- ``Conversation`` — one turn of chat history (role = 'user' | 'assistant').
"""

from datetime import datetime
from sqlalchemy import (
    Integer, String, Float, Boolean, Text, DateTime, Date,
    ForeignKey, func,
)
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship,
)
from sqlalchemy.ext.asyncio import (
    AsyncSession, async_sessionmaker, create_async_engine,
)

from config import settings


# ── Engine & session factory ─────────────────────────────────
engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# ── Base ─────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Models ───────────────────────────────────────────────────

class User(Base):
    """Registered user account.

    Owns all study data via cascading relationships. ``exam_date`` is
    optional and drives the countdown widget in the UI.
    """
    __tablename__ = "users"

    id:            Mapped[int]            = mapped_column(Integer, primary_key=True)
    username:      Mapped[str]            = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str]            = mapped_column(String(128), nullable=False)
    exam_date:     Mapped[datetime | None] = mapped_column(Date, nullable=True)
    created_at:    Mapped[datetime]        = mapped_column(DateTime, default=func.now())

    subjects:      Mapped[list["Subject"]]      = relationship("Subject", back_populates="user", cascade="all, delete")
    conversations: Mapped[list["Conversation"]] = relationship("Conversation", back_populates="user", cascade="all, delete")
    files:         Mapped[list["File"]]         = relationship("File", back_populates="user", cascade="all, delete")


class Subject(Base):
    """A named study discipline (e.g. "Algorithms") owned by one user."""
    __tablename__ = "subjects"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]      = mapped_column(ForeignKey("users.id"), nullable=False)
    name:       Mapped[str]      = mapped_column(String(128), nullable=False)
    color:      Mapped[str]      = mapped_column(String(16), default="#6ab87a")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    user:   Mapped["User"]         = relationship("User", back_populates="subjects")
    topics: Mapped[list["Topic"]]  = relationship("Topic", back_populates="subject", cascade="all, delete")
    files:  Mapped[list["File"]]   = relationship("File", back_populates="subject")


class Topic(Base):
    """A trackable concept within a subject.

    ``confidence_score`` (0–100) is updated after every quiz submission.
    ``next_review`` is set by the spaced-repetition algorithm in ``tools.py``.
    """
    __tablename__ = "topics"

    id:               Mapped[int]            = mapped_column(Integer, primary_key=True)
    user_id:          Mapped[int]            = mapped_column(ForeignKey("users.id"), nullable=False)
    subject_id:       Mapped[int]            = mapped_column(ForeignKey("subjects.id"), nullable=False)
    name:             Mapped[str]            = mapped_column(String(256), nullable=False)
    last_studied:     Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_review:      Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confidence_score: Mapped[float]           = mapped_column(Float, default=0.0)  # 0–100
    study_count:      Mapped[int]             = mapped_column(Integer, default=0)

    subject:       Mapped["Subject"]             = relationship("Subject", back_populates="topics")
    quiz_sessions: Mapped[list["QuizSession"]]   = relationship("QuizSession", back_populates="topic", cascade="all, delete")


class QuizSession(Base):
    """A completed quiz attempt used for spaced repetition and streak calculation."""
    __tablename__ = "quiz_sessions"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]      = mapped_column(ForeignKey("users.id"), nullable=False)
    topic_id:   Mapped[int]      = mapped_column(ForeignKey("topics.id"), nullable=False)
    score:      Mapped[int]      = mapped_column(Integer, nullable=False)
    total:      Mapped[int]      = mapped_column(Integer, nullable=False)
    timestamp:  Mapped[datetime] = mapped_column(DateTime, default=func.now())

    topic: Mapped["Topic"] = relationship("Topic", back_populates="quiz_sessions")


class File(Base):
    """Metadata for an uploaded PDF or image.

    The actual bytes live on disk (``filepath``). Text is extracted and stored
    in ChromaDB for semantic search. ``processed`` flips to ``True`` once the
    background indexing task completes.
    """
    __tablename__ = "files"

    id:         Mapped[int]          = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]          = mapped_column(ForeignKey("users.id"), nullable=False)
    filename:   Mapped[str]          = mapped_column(String(256), nullable=False)
    filepath:   Mapped[str]          = mapped_column(String(512), nullable=False)
    subject_id: Mapped[int | None]   = mapped_column(ForeignKey("subjects.id"), nullable=True)
    processed:  Mapped[bool]         = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime]     = mapped_column(DateTime, default=func.now())

    user:    Mapped["User"]           = relationship("User", back_populates="files")
    subject: Mapped["Subject | None"] = relationship("Subject", back_populates="files")


class Conversation(Base):
    """One turn of chat history (role = ``'user'`` or ``'assistant'``).

    Also mirrored into ChromaDB for semantic recall. ``subject_id`` allows
    filtering memory queries to the active study discipline.
    """
    __tablename__ = "conversations"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True)
    user_id:    Mapped[int]      = mapped_column(ForeignKey("users.id"), nullable=False)
    role:       Mapped[str]      = mapped_column(String(16), nullable=False)  # 'user' | 'assistant'
    content:    Mapped[str]      = mapped_column(Text, nullable=False)
    subject_id: Mapped[int|None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    timestamp:  Mapped[datetime] = mapped_column(DateTime, default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="conversations")


# ── Helpers ──────────────────────────────────────────────────

async def init_db():
    """Create all tables on startup (no-op if they exist)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[Mimir DB] Tables ready.")


async def get_db():
    """Async dependency: yields a DB session."""
    async with AsyncSessionLocal() as session:
        yield session
