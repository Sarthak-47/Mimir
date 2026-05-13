"""
Mimir — ChromaDB Vector Memory
Stores and retrieves conversation chunks for semantic recall.
"""

import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings


# ── Client (singleton pattern) ───────────────────────────────
_client: chromadb.ClientAPI | None = None

def get_chroma_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_collection(name: str = "mimir_memory"):
    """Return (or create) a named ChromaDB collection."""
    client = get_chroma_client()
    return client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"},
    )


# ── Operations ───────────────────────────────────────────────

def add_memory(
    user_id: int,
    content: str,
    role: str,
    conversation_id: int,
    subject_id: int | None = None,
) -> None:
    """Embed and store a conversation turn."""
    collection = get_collection()
    doc_id = f"u{user_id}-c{conversation_id}"

    metadata: dict = {
        "user_id": str(user_id),
        "role": role,
    }
    if subject_id is not None:
        metadata["subject_id"] = str(subject_id)

    collection.upsert(
        ids=[doc_id],
        documents=[content],
        metadatas=[metadata],
    )


def query_memory(
    user_id: int,
    query: str,
    n_results: int = 5,
    subject_id: int | None = None,
) -> list[str]:
    """Semantic search over a user's conversation history."""
    collection = get_collection()

    where: dict = {"user_id": str(user_id)}
    if subject_id is not None:
        where["subject_id"] = str(subject_id)

    try:
        results = collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where,
        )
        docs: list[str] = results.get("documents", [[]])[0]
        return docs
    except Exception:
        return []


def delete_user_memory(user_id: int) -> None:
    """Remove all memory for a user (e.g., on account deletion)."""
    collection = get_collection()
    collection.delete(where={"user_id": str(user_id)})
