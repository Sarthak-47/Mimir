"""
API contract tests for Mimir's HTTP layer.

Uses httpx AsyncClient + ASGITransport to send real HTTP requests through
the FastAPI app without a live server process. Each test class gets a fresh
in-memory SQLite database via dependency override.

Run with: pytest tests/test_api.py -v
"""

import json
import pytest
import pytest_asyncio
from pathlib import Path

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from main import app
from memory.database import get_db, Base


# ── Fixtures ─────────────────────────────────────────────────
@pytest_asyncio.fixture
async def api_client(tmp_path, monkeypatch):
    """Yield an AsyncClient wired to the FastAPI app with an isolated in-memory DB."""
    # Point user_settings file to a temp location
    import routers.system as sys_router
    monkeypatch.setattr(sys_router, "_SETTINGS_FILE", tmp_path / "user_settings.json")

    # In-memory SQLite for each test
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    TestSession = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


async def _register_and_login(client: AsyncClient, username: str = "testuser", password: str = "testpass123") -> str:
    """Helper: register a user and return their JWT token."""
    await client.post("/api/users/register", json={"username": username, "password": password})
    resp = await client.post(
        "/api/users/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return resp.json()["access_token"]


# ── Health tests ──────────────────────────────────────────────
class TestHealth:
    @pytest.mark.asyncio
    async def test_returns_200(self, api_client):
        resp = await api_client.get("/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_required_fields(self, api_client):
        data = (await api_client.get("/health")).json()
        for field in ("status", "model", "ollama_ok", "model_ok"):
            assert field in data

    @pytest.mark.asyncio
    async def test_status_is_string(self, api_client):
        data = (await api_client.get("/health")).json()
        assert data["status"] in ("ok", "degraded")

    @pytest.mark.asyncio
    async def test_model_is_string(self, api_client):
        data = (await api_client.get("/health")).json()
        assert isinstance(data["model"], str)

    @pytest.mark.asyncio
    async def test_boolean_fields(self, api_client):
        data = (await api_client.get("/health")).json()
        assert isinstance(data["ollama_ok"], bool)
        assert isinstance(data["model_ok"], bool)


# ── Auth tests ────────────────────────────────────────────────
class TestAuth:
    @pytest.mark.asyncio
    async def test_register_returns_201_and_token(self, api_client):
        resp = await api_client.post("/api/users/register", json={"username": "alice", "password": "pw123456"})
        assert resp.status_code == 201
        assert "access_token" in resp.json()

    @pytest.mark.asyncio
    async def test_register_duplicate_returns_400(self, api_client):
        await api_client.post("/api/users/register", json={"username": "bob", "password": "pw123456"})
        resp = await api_client.post("/api/users/register", json={"username": "bob", "password": "pw123456"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_login_valid_returns_200(self, api_client):
        await api_client.post("/api/users/register", json={"username": "carol", "password": "pw123456"})
        resp = await api_client.post(
            "/api/users/login",
            data={"username": "carol", "password": "pw123456"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    @pytest.mark.asyncio
    async def test_login_wrong_password_returns_401(self, api_client):
        await api_client.post("/api/users/register", json={"username": "dave", "password": "correct"})
        resp = await api_client.post(
            "/api/users/login",
            data={"username": "dave", "password": "wrong"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_without_token_returns_401(self, api_client):
        resp = await api_client.get("/api/users/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_me_with_valid_token(self, api_client):
        token = await _register_and_login(api_client, "eve", "pw123456")
        resp = await api_client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json()["username"] == "eve"

    @pytest.mark.asyncio
    async def test_me_with_invalid_token_returns_401(self, api_client):
        resp = await api_client.get("/api/users/me", headers={"Authorization": "Bearer invalid.token.here"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_set_exam_date(self, api_client):
        token = await _register_and_login(api_client, "frank", "pw123456")
        resp = await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": "2026-12-01"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_clear_exam_date(self, api_client):
        token = await _register_and_login(api_client, "grace", "pw123456")
        await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": "2026-12-01"},
            headers={"Authorization": f"Bearer {token}"},
        )
        resp = await api_client.patch(
            "/api/users/exam-date",
            json={"exam_date": None},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200


# ── System settings tests ─────────────────────────────────────
class TestSystemSettings:
    @pytest.mark.asyncio
    async def test_settings_requires_auth(self, api_client):
        resp = await api_client.get("/api/system/settings")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_settings_returns_required_fields(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.get("/api/system/settings", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        for f in ("ollama_model", "ollama_temperature", "ollama_context_length", "ollama_base_url"):
            assert f in data

    @pytest.mark.asyncio
    async def test_patch_model(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.patch(
            "/api/system/settings",
            json={"ollama_model": "llama3.2:3b"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["ollama_model"] == "llama3.2:3b"

    @pytest.mark.asyncio
    async def test_patch_persists_to_file(self, api_client, tmp_path):
        token = await _register_and_login(api_client)
        await api_client.patch(
            "/api/system/settings",
            json={"ollama_model": "phi3:mini"},
            headers={"Authorization": f"Bearer {token}"},
        )
        settings_file = tmp_path / "user_settings.json"
        assert settings_file.exists()
        saved = json.loads(settings_file.read_text())
        assert saved["ollama_model"] == "phi3:mini"

    @pytest.mark.asyncio
    async def test_clamp_temperature_above_1(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.patch(
            "/api/system/settings",
            json={"ollama_temperature": 5.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.json()["ollama_temperature"] == 1.0

    @pytest.mark.asyncio
    async def test_clamp_temperature_below_0(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.patch(
            "/api/system/settings",
            json={"ollama_temperature": -1.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.json()["ollama_temperature"] == 0.0

    @pytest.mark.asyncio
    async def test_clamp_context_above_max(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.patch(
            "/api/system/settings",
            json={"ollama_context_length": 999999},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.json()["ollama_context_length"] == 32768

    @pytest.mark.asyncio
    async def test_clamp_context_below_min(self, api_client):
        token = await _register_and_login(api_client)
        resp = await api_client.patch(
            "/api/system/settings",
            json={"ollama_context_length": 10},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.json()["ollama_context_length"] == 512

    @pytest.mark.asyncio
    async def test_models_requires_auth(self, api_client):
        resp = await api_client.get("/api/system/models")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_models_endpoint_shape(self, api_client):
        """Models endpoint should return 200 or 503 (if Ollama is down in CI)."""
        token = await _register_and_login(api_client)
        resp = await api_client.get("/api/system/models", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 503)
        if resp.status_code == 200:
            data = resp.json()
            assert isinstance(data, list)
            # Each entry must have name (str) and size_gb (number)
            for entry in data:
                assert "name" in entry
                assert "size_gb" in entry
