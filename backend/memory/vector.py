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

import re
import chromadb
from chromadb.config import Settings as ChromaSettings
from rank_bm25 import BM25Okapi

from config import settings

# ── Cross-encoder reranker (lazy singleton) ──────────────────
# Uses ms-marco-MiniLM-L-6-v2 (~80 MB, downloads on first use).
# Falls back to RRF-only if sentence-transformers is not installed.
_reranker = None
_reranker_tried = False

def _get_reranker():
    """Return the cross-encoder reranker, loading it lazily on first call."""
    global _reranker, _reranker_tried
    if _reranker_tried:
        return _reranker
    _reranker_tried = True
    try:
        from sentence_transformers import CrossEncoder
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", max_length=512)
    except Exception:
        _reranker = None
    return _reranker


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


def query_memory_with_sources(
    user_id: int,
    query: str,
    n_results: int = 5,
    subject_id: int | None = None,
) -> tuple[list[str], list[str]]:
    """Retrieve relevant past documents *and* the source filenames they came from.

    Returns:
        A ``(documents, filenames)`` tuple.  ``filenames`` contains unique
        original file names (from document metadata), in retrieval order.
        Conversation turns that carry no ``filename`` metadata are ignored in
        the sources list.
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
            include=["documents", "metadatas"],
        )
        docs: list[str] = results.get("documents", [[]])[0]
        metadatas: list[dict] = results.get("metadatas", [[]])[0]

        sources: list[str] = []
        seen: set[str] = set()
        for meta in metadatas:
            fn = (meta or {}).get("filename", "")
            if fn and fn not in seen:
                seen.add(fn)
                sources.append(fn)

        return docs, sources
    except Exception:
        return [], []


def _tokenize(text: str) -> list[str]:
    """Lowercase word tokeniser for BM25."""
    return re.findall(r"[a-z0-9]+", text.lower())


def query_memory_hybrid(
    user_id: int,
    query: str,
    n_results: int = 5,
    subject_id: int | None = None,
    candidate_pool: int = 20,
) -> tuple[list[str], list[str]]:
    """Hybrid retrieval: vector similarity + BM25 keyword search, merged via RRF.

    Retrieves ``candidate_pool`` documents from ChromaDB using vector search,
    then reranks them with BM25 keyword matching. Final scores are merged with
    Reciprocal Rank Fusion so that documents ranking well on *both* signals
    float to the top.

    Args:
        user_id:        Restricts results to this user's data.
        query:          Natural-language query string.
        n_results:      Number of final documents to return.
        subject_id:     Optional discipline scope.
        candidate_pool: How many candidates to fetch from ChromaDB before BM25.

    Returns:
        ``(documents, filenames)`` — same shape as ``query_memory_with_sources``.
    """
    collection = get_collection()
    where: dict = {"user_id": str(user_id)}
    if subject_id is not None:
        where["subject_id"] = str(subject_id)

    try:
        results = collection.query(
            query_texts=[query],
            n_results=min(candidate_pool, 100),
            where=where,
            include=["documents", "metadatas"],
        )
        docs: list[str]      = results.get("documents", [[]])[0]
        metas: list[dict]    = results.get("metadatas", [[]])[0]

        if not docs:
            return [], []

        # ── BM25 reranking ───────────────────────────────────
        tokenized_corpus = [_tokenize(d) for d in docs]
        bm25 = BM25Okapi(tokenized_corpus)
        bm25_scores = bm25.get_scores(_tokenize(query))

        # ── Reciprocal Rank Fusion (k=60) ────────────────────
        # Vector rank comes from ChromaDB order (index = rank)
        rrf_k = 60
        rrf: dict[int, float] = {}
        for vec_rank, idx in enumerate(range(len(docs))):
            rrf[idx] = rrf.get(idx, 0.0) + 1.0 / (rrf_k + vec_rank + 1)

        # BM25 rank: sort indices by BM25 score descending
        bm25_ranked = sorted(range(len(docs)), key=lambda i: bm25_scores[i], reverse=True)
        for bm25_rank, idx in enumerate(bm25_ranked):
            rrf[idx] = rrf.get(idx, 0.0) + 1.0 / (rrf_k + bm25_rank + 1)

        # ── RRF: pick intermediate pool (2× final size) for reranker ──
        rrf_pool = min(n_results * 2, len(docs))
        rrf_indices = sorted(rrf.keys(), key=lambda i: rrf[i], reverse=True)[:rrf_pool]

        pool_docs  = [docs[i]  for i in rrf_indices]
        pool_metas = [metas[i] for i in rrf_indices]

        # ── Cross-encoder rerank ─────────────────────────────
        reranker = _get_reranker()
        if reranker is not None and len(pool_docs) > 1:
            try:
                pairs  = [(query, d[:500]) for d in pool_docs]
                scores = reranker.predict(pairs)
                order  = sorted(range(len(pool_docs)), key=lambda i: scores[i], reverse=True)
                pool_docs  = [pool_docs[i]  for i in order]
                pool_metas = [pool_metas[i] for i in order]
            except Exception:
                pass   # fall back to RRF order silently

        final_docs  = pool_docs[:n_results]
        final_metas = pool_metas[:n_results]

        sources: list[str] = []
        seen: set[str] = set()
        for meta in final_metas:
            fn = (meta or {}).get("filename", "")
            if fn and fn not in seen:
                seen.add(fn)
                sources.append(fn)

        return final_docs, sources

    except Exception:
        return [], []


def add_document_memory(
    user_id: int,
    content: str,
    file_id: int,
    chunk_idx: int,
    subject_id: int | None = None,
    filename: str = "",
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
    if filename:
        metadata["filename"] = filename

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
