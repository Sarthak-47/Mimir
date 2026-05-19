"""
Shared pytest configuration and fixtures for the Mimir backend test suite.

Adds the backend directory to sys.path so tests can import backend modules
directly (e.g. `from agent.tools import compute_sm2`) without installing the
package. Also provides reusable fixtures for ephemeral ChromaDB clients.
"""

import sys
import os
from pathlib import Path

import pytest

# ── Make backend root importable ────────────────────────────────────────────
# Tests live in backend/tests/; the modules they test live in backend/.
# Adding backend/ to sys.path lets `from agent.tools import ...` work without
# a package install.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ── Ephemeral ChromaDB fixture ───────────────────────────────────────────────

@pytest.fixture()
def ephemeral_chroma(monkeypatch):
    """Replace the module-level ChromaDB singleton with an ephemeral (in-memory)
    client for the duration of a test.

    This means no data is written to disk and tests are fully isolated from the
    development database.  The monkeypatch is reverted automatically after the
    test.
    """
    import chromadb
    import memory.vector as vec_module

    client = chromadb.EphemeralClient()
    monkeypatch.setattr(vec_module, "_client", client)
    yield client
    # Restore to None so the next test gets a fresh client
    monkeypatch.setattr(vec_module, "_client", None)
