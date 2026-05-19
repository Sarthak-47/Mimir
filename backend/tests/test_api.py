"""
API contract tests — exercises the HTTP layer of the Mimir backend.

Uses httpx.AsyncClient + ASGITransport to send real HTTP requests through
the FastAPI ASGI app without starting a server process.

The ``get_db`` FastAPI dependency is overridden with an in-memory SQLite
database so tests are fully isolated and leave no files on disk.  The
APScheduler lifespan is not triggered because ASGITransport does not enter
the ASGI lifespan context automatically.

Coverage:
  - GET  /health                      (liveness + readiness probe)
  - POST /api/users/register          (new account creation)
  - POST /api/users/login             (authenticate, receive JWT)
  - GET  /api/users/me                (profile, auth required)
  - PATCH /api/users/exam-date        (store exam deadline)
  - GET  /api/system/settings         (runtime config, auth required)
  - PATCH /api/system/settings        (update + clamp values)
  - GET  /api/system/models           (Ollama model list, auth required)
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture()
async def api_client(monkeypatch):
    """Yield an AsyncClient wired to the FastAPI app with an ephemeral SQLite DB.

    Steps:
    1. Create an in-memory SQLite engine and session factory.
    2. Create all ORM tables.
    3. Override the ``get_db`` FastAPI dependency so every request uses the
       in-memory DB — no real database file is touched.
    4. Yield an httpx.AsyncClient; tear down after the test.
    """
    from memory.database import Base, get_db
    from main import app

    # ── In-memory DB ──────────────────────────────────────────
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    TestSession  = async_sessionmaker(test_engine, expire_on_commit=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def _override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = _override_get_db

    # ── Client ────────────────────────────────────────────────
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    # ── Cleanup ───────────────────────────────────────────────
    app.dependency_overrides.clear()
    await test_engine.dispose()


# ── Helper ───────────────────────────────────────────────────────────────────

async def _register_and_login(
    client: AsyncClient,
    username: str = "raven",
    password: str = "odin42",
) -> str:
    """Register a fresh user and return their JWT access token."""
    await client.post(
        "/api/users/register",
        json={"username": username, "password": password},
    )
    r = await client.post(
        "/api/users/login",
        content=f"username={username}&password={password}",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return r.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Health ────────────────────────────────────────────────────────────────────

class TestHealth:
    """GET /health — liveness + readiness probe."""

    async def test_returns_200(self, api_client):
        r = await api_client.get("/health")
        assert r.status_code == 200

    async def test_has_required_fields(self, api_client):
        data = (await api_client.get("/health")).json()
        for field in ("status", "model", "ollama_ok", "model_ok"):
            assert field in data, f"missing field: {field}"

    async def test_status_is_valid_enum(self, api_client):
        data = (await api_client.get("/health")).json()
        assert data["status"] in ("ok", "degraded")

    async def test_model_field_is_string(self, api_client):
        data = (await api_client.get("/health")).json()
        assert isinstance(data["model"], str)
        assert len(data["model"]) > 0

    async def test_boolean_fields(self, api_client):
        data = (await api_client.get("/health")).json()
        assert isinstance(data["ollama_ok"], bool)
        assert isinstance(data["model_ok"], bool)


# ── Auth ──────────────────────────────────────────────────────────────────────

class TestAuth:
    """POST /register · POST /login · GET /me · PATCH /exam-date"""

    async def test_register_returns_201_with_token(self, api_client):
        r = await api_client.post(
            "/api/users/register",
            json={"username": "thor", "password": "mjolnir99"},
        )
        assert r.status_code == 201
        data = r.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_register_duplicate_username_returns_400(self, api_client):
        payload = {"username": "loki", "password": "trickster"}
        await api_client.post("/api/users/register", json=payload)
        r = await api_client.post("/api/users/register", json=payload)
        assert r.status_code == 400

    async def test_login_valid_credentials_returns_token(self, api_client):
        await api_client.post(
            "/api/users/register",
            json={"username": "odin", "password": "allfather"},
        )
        r = await api_client.post(
            "/api/users/login",
            content="username=odin&password=allfather",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_login_wrong_password_returns_401(self, api_client):
        await api_client.post(
            "/api/users/register",
            json={"username": "frigg", "password": "correct"},
        )
        r = await api_client.post(
            "/api/users/login",
            content="username=frigg&password=wrong",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert r.status_code == 401

    async def test_me_without_token_returns_401(self, api_client):
        r = await api_client.get("/api/users/me")
        assert r.status_code == 401

    async def test_me_with_valid_token_returns_user_profile(self, api_client):
        token = await _register_and_login(api_client, "baldur", "lightgod")
        r = await api_client.get("/api/users/me", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert data["username"] == "baldur"
        assert "id" in data
        assert "created_at" in data

    async def test_me_with_invalid_token_returns_401(self, api_client):
        r = await api_client.get(
            "/api/users/me",
            headers={"Authorization": "Bearer not.a.real.token"},
        )
        assert r.status_code == 401

    async def test_set_exam_date_persists(self, api_client):
        token = await _register_and_login(api_client, "tyr", "lawgiver")
        r = await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": "2025-06-15"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["exam_date"] == "2025-06-15"

    async def test_clear_exam_date(self, api_client):
        token = await _register_and_login(api_client, "mimir", "wisdomwell")
        # Set a date first
        await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": "2025-12-01"},
            headers=_auth(token),
        )
        # Clear it
        r = await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": None},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["exam_date"] is None


# ── System Settings ───────────────────────────────────────────────────────────

class TestSystemSettings:
    """GET /api/system/settings · PATCH /api/system/settings · GET /api/system/models"""

    async def test_get_settings_requires_auth(self, api_client):
        r = await api_client.get("/api/system/settings")
        assert r.status_code == 401

    async def test_get_settings_returns_required_fields(self, api_client):
        token = await _register_and_login(api_client)
        r = await api_client.get("/api/system/settings", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        for field in ("ollama_model", "ollama_temperature", "ollama_context_length", "ollama_base_url"):
            assert field in data, f"missing field: {field}"

    async def test_patch_settings_updates_model(self, api_client, monkeypatch, tmp_path):
        from routers import system as sys_mod
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", tmp_path / "s.json")

        token = await _register_and_login(api_client)
        r = await api_client.patch(
            "/api/system/settings",
            json={"ollama_model": "llama3:8b"},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["ollama_model"] == "llama3:8b"

    async def test_patch_settings_persists_to_file(self, api_client, monkeypatch, tmp_path):
        import json
        from routers import system as sys_mod
        settings_path = tmp_path / "s.json"
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", settings_path)

        token = await _register_and_login(api_client)
        await api_client.patch(
            "/api/system/settings",
            json={"ollama_model": "mistral:7b", "ollama_temperature": 0.5},
            headers=_auth(token),
        )
        saved = json.loads(settings_path.read_text())
        assert saved["ollama_model"] == "mistral:7b"
        assert saved["ollama_temperature"] == pytest.approx(0.5)

    async def test_patch_settings_clamps_temperature_above_max(self, api_client, monkeypatch, tmp_path):
        from routers import system as sys_mod
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", tmp_path / "s.json")

        token = await _register_and_login(api_client)
        r = await api_client.patch(
            "/api/system/settings",
            json={"ollama_temperature": 9.99},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["ollama_temperature"] == pytest.approx(1.0)

    async def test_patch_settings_clamps_temperature_below_min(self, api_client, monkeypatch, tmp_path):
        from routers import system as sys_mod
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", tmp_path / "s.json")

        token = await _register_and_login(api_client)
        r = await api_client.patch(
            "/api/system/settings",
            json={"ollama_temperature": -1.0},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["ollama_temperature"] == pytest.approx(0.0)

    async def test_patch_settings_clamps_context_length_above_max(self, api_client, monkeypatch, tmp_path):
        from routers import system as sys_mod
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", tmp_path / "s.json")

        token = await _register_and_login(api_client)
        r = await api_client.patch(
            "/api/system/settings",
            json={"ollama_context_length": 999_999},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["ollama_context_length"] == 32_768

    async def test_patch_settings_clamps_context_length_below_min(self, api_client, monkeypatch, tmp_path):
        from routers import system as sys_mod
        monkeypatch.setattr(sys_mod, "_SETTINGS_FILE", tmp_path / "s.json")

        token = await _register_and_login(api_client)
        r = await api_client.patch(
            "/api/system/settings",
            json={"ollama_context_length": 0},
            headers=_auth(token),
        )
        assert r.status_code == 200
        assert r.json()["ollama_context_length"] == 512

    async def test_get_models_requires_auth(self, api_client):
        r = await api_client.get("/api/system/models")
        assert r.status_code == 401

    async def test_get_models_returns_list(self, api_client):
        """Models endpoint returns a list (may be empty when Ollama is not running)."""
        token = await _register_and_login(api_client)
        r = await api_client.get("/api/system/models", headers=_auth(token))
        assert r.status_code == 200
        data = r.json()
        assert "models" in data
        assert isinstance(data["models"], list)
