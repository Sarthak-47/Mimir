"""
Shared pytest configuration and fixtures for the Mimir backend test suite.

Adds the backend directory to sys.path so tests can import backend modules
directly (e.g. `from agent.tools import compute_sm2`) without installing the
package. Also provides reusable fixtures for ephemeral ChromaDB clients.
"""

import sys
from pathlib import Path

import pytest

# ── Make backend root importable ────────────────────────────────────────────
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


# ── Tiny deterministic embedding function ────────────────────────────────────

class _TinyEmbedFn:
    """16-dimensional deterministic embedding for tests.

    Avoids downloading any model (all-MiniLM-L6-v2, cross-encoder, etc.) so
    the test suite runs without internet access and completes in seconds.
    The values are meaningless for ranking but structurally valid for ChromaDB.

    ChromaDB 1.x requires embedding functions to expose a ``name()`` method.
    """

    DIM = 16

    def name(self) -> str:
        """Return a stable identifier for this embedding function (ChromaDB 1.x API)."""
        return "mimir_test_tiny_embed"

    def embed_query(self, input: list[str]) -> list[list[float]]:
        """Embed query texts (ChromaDB 1.x calls this for query() calls)."""
        return self(input)

    def __call__(self, input: list[str]) -> list[list[float]]:
        result = []
        for s in input:
            if not s:
                result.append([0.0] * self.DIM)
                continue
            vec = [float(ord(s[i % len(s)]) % 97 + 1) / 100.0 for i in range(self.DIM)]
            result.append(vec)
        return result


# ── Ephemeral ChromaDB fixture ───────────────────────────────────────────────

@pytest.fixture()
def ephemeral_chroma(monkeypatch):
    """Replace the module-level ChromaDB singleton with an ephemeral (in-memory)
    client for the duration of a test.

    - Uses a tiny custom embedding function — no model download required.
    - Disables the cross-encoder reranker so sentence-transformers is not loaded.
    - No data is written to disk; each test gets a fully isolated collection.
    """
    import chromadb
    import memory.vector as vec_module

    client = chromadb.EphemeralClient()
    embed_fn = _TinyEmbedFn()

    # Patch the reranker to None so the cross-encoder is never loaded
    monkeypatch.setattr(vec_module, "_reranker", None)
    monkeypatch.setattr(vec_module, "_reranker_tried", True)

    # Patch _client so get_chroma_client() returns our ephemeral instance
    monkeypatch.setattr(vec_module, "_client", client)

    # Patch get_collection to use the tiny embedding function
    def _get_test_collection(name: str = "mimir_memory"):
        return client.get_or_create_collection(
            name=name,
            embedding_function=embed_fn,
            metadata={"hnsw:space": "cosine"},
        )

    monkeypatch.setattr(vec_module, "get_collection", _get_test_collection)

    yield client

    # Restore so the next test starts clean
    monkeypatch.setattr(vec_module, "_client", None)
