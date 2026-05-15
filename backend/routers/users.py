"""
Mimir — Users Router (Auth)
POST /api/users/register
POST /api/users/login
GET  /api/users/me
"""

from datetime import datetime, timedelta, date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from config import settings
from memory.database import User, get_db

router = APIRouter()

# ── Auth helpers ─────────────────────────────────────────────
pwd_context    = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme  = OAuth2PasswordBearer(tokenUrl="/api/users/login")


def hash_password(password: str) -> str:
    """Return a bcrypt hash of ``password``."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if ``plain`` matches the stored ``hashed`` bcrypt digest."""
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    """Encode ``data`` as a signed JWT with an expiry claim.

    The token is valid for ``settings.access_token_expire_minutes`` minutes
    (default 1 week). The ``sub`` claim should be the username.
    """
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_jwt(token: str) -> str | None:
    """Decode a JWT and return the username (sub), or None if invalid."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        sub: str = payload.get("sub", "")
        return sub if sub else None
    except JWTError:
        return None


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency: validate Bearer token and return the authenticated User.

    Raises ``HTTP 401`` if the token is missing, expired, or the username does
    not exist in the database.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: str = payload.get("sub", "")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


# ── Schemas ──────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    """Payload for ``POST /api/users/register``."""
    username: str
    password: str

class TokenResponse(BaseModel):
    """JWT response returned after successful register or login."""
    access_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    """Public user profile returned by ``GET /api/users/me``."""
    id: int
    username: str
    exam_date: date | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class ExamDateRequest(BaseModel):
    """Payload for ``PATCH /api/users/exam-date``."""
    exam_date: date | None = None


# ── Endpoints ────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new user account and return a JWT. Raises 400 if username is taken."""
    # Check username taken
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(username=req.username, password_hash=hash_password(req.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with username + password and return a JWT. Raises 401 on failure."""
    result = await db.execute(select(User).where(User.username == form.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": user.username})
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return current_user


@router.patch("/exam-date", response_model=UserResponse)
async def set_exam_date(
    req: ExamDateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update (or clear) the user's exam date, which drives the Ragnarök countdown."""
    current_user.exam_date = req.exam_date
    await db.commit()
    await db.refresh(current_user)
    return current_user
