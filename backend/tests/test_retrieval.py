"""
Tests for the hybrid BM25 + vector + RRF retrieval pipeline (memory/vector.py).

Organised into two layers:

  1. Pure-function unit tests — _tokenize, RRF math — no I/O.
  2. Integration tests — add_memory / query_memory_hybrid using an ephemeral
     (in-memory) ChromaDB client injected by the `ephemeral_chroma` fixture in
     conftest.py.  These never touch the development database.
"""

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# _tokenize — pure function
# ─────────────────────────────────────────────────────────────────────────────

class TestTokenize:
    """The tokeniser is used by BM25 to build its inverted index."""

    def _tok(self, text):
        from memory.vector import _tokenize
        return _tokenize(text)

    def test_lowercases_input(self):
        assert self._tok("Hello WORLD") == ["hello", "world"]

    def test_splits_on_non_alphanumeric(self):
        assert self._tok("foo-bar_baz") == ["foo", "bar", "baz"]

    def test_includes_digits(self):
        assert "42" in self._tok("chapter 42")

    def test_empty_string_returns_empty_list(self):
        assert self._tok("") == []

    def test_punctuation_only_returns_empty_list(self):
        assert self._tok("!!! ???") == []

    def test_duplicate_words_are_preserved(self):
        """BM25 relies on term frequency; duplicates must not be collapsed."""
        tokens = self._tok("the cat sat on the mat")
        assert tokens.count("the") == 2


# ─────────────────────────────────────────────────────────────────────────────
# RRF score mathematics
# ─────────────────────────────────────────────────────────────────────────────

class TestRRFMath:
    """Verify the Reciprocal Rank Fusion formula used inside query_memory_hybrid.

    RRF score for document at rank r (0-indexed) with k=60:
        score = 1 / (60 + r + 1)
    A document ranked first by both signals has a combined score of 2/61.
    """

    RRF_K = 60

    def _rrf_score(self, rank: int) -> float:
        return 1.0 / (self.RRF_K + rank + 1)

    def test_rank_0_score_is_correct(self):
        assert self._rrf_score(0) == pytest.approx(1 / 61, rel=1e-6)

    def test_rank_1_score_is_less_than_rank_0(self):
        assert self._rrf_score(1) < self._rrf_score(0)

    def test_top_ranked_by_both_signals_beats_top_by_one(self):
        """A document ranked #1 in vector AND #1 in BM25 should outscore one that
        is #1 in only one signal."""
        both_first   = self._rrf_score(0) + self._rrf_score(0)   # 2/61
        only_one     = self._rrf_score(0) + self._rrf_score(10)  # 1/61 + 1/71
        assert both_first > only_one

    def test_scores_are_symmetric(self):
        """Swapping vector rank and BM25 rank gives the same combined score."""
        a = self._rrf_score(2) + self._rrf_score(5)
        b = self._rrf_score(5) + self._rrf_score(2)
        assert a == pytest.approx(b, rel=1e-9)

    def test_scores_are_always_positive(self):
        for rank in range(20):
            assert self._rrf_score(rank) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Integration tests — ephemeral ChromaDB
# ─────────────────────────────────────────────────────────────────────────────

class TestAddAndQueryMemory:
    """Smoke-test the add → query round-trip against an in-memory ChromaDB.

    These tests verify that:
      - add_memory / add_document_memory successfully upsert without errors.
      - query_memory returns results that belong to the correct user.
      - User isolation works (user A's data is never returned for user B).
    """

    def test_add_memory_does_not_raise(self, ephemeral_chroma):
        from memory.vector import add_memory
        add_memory(user_id=1, content="Photosynthesis is a process.", role="user", conversation_id=1)

    def test_query_memory_returns_list(self, ephemeral_chroma):
        from memory.vector import add_memory, query_memory
        add_memory(user_id=1, content="The mitochondria is the powerhouse.", role="user", conversation_id=2)
        results = query_memory(user_id=1, query="mitochondria", n_results=5)
        assert isinstance(results, list)

    def test_query_memory_finds_relevant_document(self, ephemeral_chroma):
        from memory.vector import add_memory, query_memory
        add_memory(user_id=1, content="ATP is produced in the mitochondria.", role="user", conversation_id=3)
        add_memory(user_id=1, content="The French revolution began in 1789.", role="user", conversation_id=4)
        results = query_memory(user_id=1, query="ATP production", n_results=5)
        assert len(results) >= 1
        # The ATP document should appear somewhere in the results
        combined = " ".join(results).lower()
        assert "atp" in combined or "mitochondria" in combined

    def test_user_isolation_query(self, ephemeral_chroma):
        """Documents added for user 1 must not be returned when querying as user 2."""
        from memory.vector import add_memory, query_memory
        add_memory(user_id=1, content="User one secret: mitochondria ATP.", role="user", conversation_id=10)
        results_user2 = query_memory(user_id=2, query="mitochondria", n_results=5)
        combined = " ".join(results_user2).lower()
        assert "secret" not in combined

    def test_add_document_memory_does_not_raise(self, ephemeral_chroma):
        from memory.vector import add_document_memory
        add_document_memory(
            user_id=1,
            content="Enzyme kinetics: Michaelis-Menten equation.",
            file_id=99,
            chunk_idx=0,
            subject_id=1,
            filename="kinetics.pdf",
        )

    def test_query_memory_with_sources_returns_filenames(self, ephemeral_chroma):
        from memory.vector import add_document_memory, query_memory_with_sources
        add_document_memory(
            user_id=1,
            content="Glycolysis converts glucose to pyruvate in 10 steps.",
            file_id=100,
            chunk_idx=0,
            filename="glycolysis.pdf",
        )
        docs, sources = query_memory_with_sources(user_id=1, query="glycolysis glucose", n_results=5)
        assert isinstance(docs, list)
        assert isinstance(sources, list)

    def test_delete_document_memory_removes_chunks(self, ephemeral_chroma):
        from memory.vector import add_document_memory, delete_document_memory, query_memory
        add_document_memory(
            user_id=1,
            content="Krebs cycle produces NADH and FADH2.",
            file_id=200,
            chunk_idx=0,
            filename="krebs.pdf",
        )
        delete_document_memory(user_id=1, file_id=200)
        results = query_memory(user_id=1, query="Krebs NADH", n_results=5)
        # After deletion the content should not be retrievable
        combined = " ".join(results).lower()
        assert "fadh2" not in combined


# ─────────────────────────────────────────────────────────────────────────────
# Hybrid retrieval ranking smoke test
# ─────────────────────────────────────────────────────────────────────────────

class TestHybridRanking:
    """Verify that the hybrid pipeline returns results without crashing and
    respects user scoping.  Full ranking correctness is hard to assert
    deterministically, so we check structural invariants instead."""

    def test_hybrid_returns_tuple_of_two_lists(self, ephemeral_chroma):
        from memory.vector import add_memory, query_memory_hybrid
        add_memory(user_id=5, content="Respiration produces ATP.", role="user", conversation_id=50)
        docs, sources = query_memory_hybrid(user_id=5, query="ATP")
        assert isinstance(docs, list)
        assert isinstance(sources, list)

    def test_hybrid_result_count_respects_n_results(self, ephemeral_chroma):
        from memory.vector import add_memory, query_memory_hybrid
        for i in range(10):
            add_memory(user_id=6, content=f"Biology fact number {i} about cells.", role="user", conversation_id=60 + i)
        docs, _ = query_memory_hybrid(user_id=6, query="cells", n_results=3)
        assert len(docs) <= 3

    def test_hybrid_empty_collection_returns_empty(self, ephemeral_chroma):
        """Querying a user with no memories should return empty lists, not crash."""
        from memory.vector import query_memory_hybrid
        docs, sources = query_memory_hybrid(user_id=999, query="anything")
        assert docs == []
        assert sources == []
