"""
Mimir — ChromaDB Vector Memory.

Provides a thin wrapper around a single ChromaDB persistent collection
(``mimir_memory``) that stores conversation turns and document chunks.
ChromaDB handles embedding internally using its default embedding function.

All IDs are namespaced with ``u<user_id>`` so different users' memories
never collide within the shared collection. An optional ``subject_id``
metadata field allows queries to be scoped to the active discipline.

The ChromaDB client is created lazily and reused as a module-level singleton.
"""

import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings


# ── Client (singleton pattern) ───────────────────────────────
_client: chromadb.ClientAPI | None = None

def get_chroma_client() -> chromadb.ClientAPI:
    """Return the module-level ChromaDB client, creating it on first call."""
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
    """Upsert a single conversation turn into ChromaDB.

    Args:
        user_id: Owner of the memory (used for scoping queries).
        content: Raw text of the message.
        role: ``'user'`` or ``'assistant'``.
        conversation_id: Primary key from the ``conversations`` table.
        subject_id: Optional discipline ID for scoped retrieval.
    """
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
    """Return the top-N most semantically relevant past conversation texts.

    Args:
        user_id: Restricts results to this user's data.
        query: Natural-language query used to compute embedding similarity.
        n_results: Maximum number of documents to return.
        subject_id: When provided, further restricts to a single discipline.

    Returns:
        List of matching document strings (empty on error or no results).
    """
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


def add_document_memory(
    user_id: int,
    content: str,
    file_id: int,
    chunk_idx: int,
    subject_id: int | None = None,
) -> None:
    """Upsert one text chunk from a parsed PDF or image into ChromaDB.

    IDs are of the form ``u<user_id>-f<file_id>-chunk<chunk_idx>``, so
    re-indexing the same file is idempotent.

    Args:
        user_id: Owner of the uploaded file.
        content: Raw extracted text for this chunk.
        file_id: Primary key from the ``files`` table.
        chunk_idx: Sequential zero-based chunk index within the file.
        subject_id: Optional discipline ID for scoped retrieval.
    """
    collection = get_collection()
    doc_id = f"u{user_id}-f{file_id}-chunk{chunk_idx}"

    metadata: dict = {
        "user_id":  str(user_id),
        "role":     "document",
        "file_id":  str(file_id),
    }
    if subject_id is not None:
        metadata["subject_id"] = str(subject_id)

    collection.upsert(
        ids=[doc_id],
        documents=[content],
        metadatas=[metadata],
    )


def delete_document_memory(user_id: int, file_id: int) -> None:
    """Remove all chunks for a specific uploaded file from ChromaDB."""
    collection = get_collection()
    try:
        collection.delete(where={"file_id": str(file_id)})
    except Exception:
        pass  # collection may be empty or chunk never indexed


def delete_user_memory(user_id: int) -> None:
    """Remove all memory for a user (e.g., on account deletion)."""
    collection = get_collection()
    collection.delete(where={"user_id": str(user_id)})
