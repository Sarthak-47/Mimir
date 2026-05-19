"""
Integration tests for the ReAct agent loop (agent/loop.py).

Tests both primary code paths without calling Ollama or the database:

  Direct-answer path — model returns plain prose → tokens stream to caller.
  Tool path          — model outputs ACTION/ARGS → tool runs → synthesis streams.

All external I/O (Ollama, SQLite, ChromaDB) is replaced with lightweight mocks
so these tests run in milliseconds and require no running services.
"""

import json
import pytest
from unittest.mock import MagicMock

import agent.loop as loop_module
from agent.loop import run_agent


# ─────────────────────────────────────────────────────────────────────────────
# Test helpers
# ─────────────────────────────────────────────────────────────────────────────

def _stream(*tokens: str):
    """Return an async generator of Ollama-format chunk dicts."""
    async def _gen():
        for tok in tokens:
            yield {"message": {"content": tok}}
    return _gen()


class _MockSession:
    """Async context manager that returns empty DB result sets for all queries."""
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def execute(self, _query):
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        return result


async def _collect(gen) -> list[str]:
    """Drain an async generator and return all yielded strings."""
    out = []
    async for item in gen:
        out.append(item)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _mock_db(monkeypatch):
    """Patch AsyncSessionLocal for every test in this module."""
    import memory.database as db_module
    monkeypatch.setattr(db_module, "AsyncSessionLocal", _MockSession)


@pytest.fixture(autouse=True)
def _mock_memory(monkeypatch):
    """Patch hybrid memory retrieval to return nothing for every test."""
    monkeypatch.setattr(loop_module, "query_memory_hybrid", lambda *a, **kw: ([], []))


# ─────────────────────────────────────────────────────────────────────────────
# Direct-answer path
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_direct_answer_streams_tokens(monkeypatch):
    """Plain prose from the model should be yielded token-by-token."""
    async def _chat(**kw):
        return _stream("The ", "answer ", "is ", "photosynthesis.")

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="What is photosynthesis?",
        user_id=1,
        conversation_history=[],
    ))

    assert "photosynthesis" in "".join(chunks)


@pytest.mark.asyncio
async def test_direct_answer_no_sentinels(monkeypatch):
    """A plain answer must contain no ACTION or TOOL_DATA sentinels."""
    async def _chat(**kw):
        return _stream("Mitochondria ", "produce ", "ATP.")

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="Tell me about mitochondria",
        user_id=1,
        conversation_history=[],
    ))

    combined = "".join(chunks)
    assert "__ACTION__" not in combined
    assert "__TOOL_DATA__" not in combined


@pytest.mark.asyncio
async def test_direct_answer_long_response(monkeypatch):
    """A multi-token response beyond the peek window must fully stream through."""
    # 20 tokens — well past the 80-char peek window
    tokens = [f"word{i} " for i in range(20)]

    async def _chat(**kw):
        return _stream(*tokens)

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="Explain in detail",
        user_id=1,
        conversation_history=[],
    ))

    # All 20 tokens must appear in the output
    combined = "".join(chunks)
    for i in range(20):
        assert f"word{i}" in combined


@pytest.mark.asyncio
async def test_sources_yielded_last_when_retrieved(monkeypatch):
    """__SOURCES__: must be the final chunk when retrieval returns filenames."""
    async def _chat(**kw):
        return _stream("Great question.")

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)
    monkeypatch.setattr(
        loop_module, "query_memory_hybrid",
        lambda *a, **kw: (["some doc"], ["biology.pdf"]),
    )

    chunks = await _collect(run_agent(
        user_message="Any question",
        user_id=1,
        conversation_history=[],
    ))

    assert chunks[-1].startswith("__SOURCES__:")
    sources = json.loads(chunks[-1].split("__SOURCES__:", 1)[1])
    assert "biology.pdf" in sources


@pytest.mark.asyncio
async def test_exam_date_accepted_without_error(monkeypatch):
    """Passing exam_date must not crash the agent."""
    async def _chat(**kw):
        return _stream("I see your exam is coming up.")

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="Make me a revision plan",
        user_id=1,
        conversation_history=[],
        exam_date="2025-06-15",
    ))

    assert isinstance(chunks, list)
    assert len(chunks) > 0


# ─────────────────────────────────────────────────────────────────────────────
# Tool path
# ─────────────────────────────────────────────────────────────────────────────

def _make_dual_chat(first_tokens, second_tokens):
    """Return a chat function that serves two sequential streaming responses."""
    call_count = 0

    async def _chat(**kw):
        nonlocal call_count
        toks = first_tokens if call_count == 0 else second_tokens
        call_count += 1
        return _stream(*toks)

    return _chat


@pytest.mark.asyncio
async def test_tool_path_yields_action_sentinel(monkeypatch):
    """When the model emits ACTION: quiz the __ACTION__:quiz sentinel must be yielded."""
    tool_call   = ['ACTION: quiz\nARGS: {"topic": "Osmosis", "subject": "Biology", "n": 3}']
    synthesis   = ["Here ", "are ", "your ", "questions."]

    mock_client = MagicMock()
    mock_client.chat = _make_dual_chat(tool_call, synthesis)
    monkeypatch.setattr(loop_module, "_client", mock_client)

    fake_quiz = [{"question": "Q?", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "x"}]
    monkeypatch.setattr(loop_module, "TOOLS", {"quiz": lambda **kw: fake_quiz})

    chunks = await _collect(run_agent(
        user_message="Quiz me on Osmosis",
        user_id=1,
        conversation_history=[],
    ))

    assert "__ACTION__:quiz" in "".join(chunks)


@pytest.mark.asyncio
async def test_tool_path_yields_tool_data_json(monkeypatch):
    """__TOOL_DATA__: must carry the JSON-encoded tool output."""
    tool_call = ['ACTION: quiz\nARGS: {"topic": "Osmosis", "n": 3}']
    synthesis = ["Here are your questions."]

    mock_client = MagicMock()
    mock_client.chat = _make_dual_chat(tool_call, synthesis)
    monkeypatch.setattr(loop_module, "_client", mock_client)

    fake_quiz = [{"question": "What is osmosis?", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "Water moves down a concentration gradient."}]
    monkeypatch.setattr(loop_module, "TOOLS", {"quiz": lambda **kw: fake_quiz})

    chunks = await _collect(run_agent(
        user_message="Quiz me",
        user_id=1,
        conversation_history=[],
    ))

    tool_data_chunks = [c for c in chunks if "__TOOL_DATA__:" in c]
    assert len(tool_data_chunks) == 1

    raw_json = tool_data_chunks[0].split("__TOOL_DATA__:", 1)[1].strip()
    payload  = json.loads(raw_json)
    assert isinstance(payload, list)
    assert payload[0]["question"] == "What is osmosis?"


@pytest.mark.asyncio
async def test_tool_path_synthesis_text_reaches_caller(monkeypatch):
    """The synthesis text (second Ollama call) must be streamed to the caller."""
    tool_call = ['ACTION: flashcards\nARGS: {"topic": "Photosynthesis", "n": 5}']
    synthesis = ["Here ", "are ", "your ", "flashcards."]

    mock_client = MagicMock()
    mock_client.chat = _make_dual_chat(tool_call, synthesis)
    monkeypatch.setattr(loop_module, "_client", mock_client)

    fake_cards = [{"front": "What is ATP?", "back": "Adenosine triphosphate"}]
    monkeypatch.setattr(loop_module, "TOOLS", {"flashcards": lambda **kw: fake_cards})

    chunks = await _collect(run_agent(
        user_message="Give me flashcards on Photosynthesis",
        user_id=1,
        conversation_history=[],
    ))

    combined = "".join(chunks)
    assert "flashcards" in combined.lower()


@pytest.mark.asyncio
async def test_unknown_tool_does_not_crash(monkeypatch):
    """An unrecognised tool name must not raise — remaining prose is returned."""
    async def _chat(**kw):
        return _stream('ACTION: nonexistent_tool\nARGS: {"x": 1}')

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    # Should not raise
    chunks = await _collect(run_agent(
        user_message="Do something",
        user_id=1,
        conversation_history=[],
    ))
    assert isinstance(chunks, list)


@pytest.mark.asyncio
async def test_empty_model_response_does_not_crash(monkeypatch):
    """A model that yields no tokens must not crash run_agent."""
    async def _chat(**kw):
        return _stream()   # empty stream

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="Hello",
        user_id=1,
        conversation_history=[],
    ))
    assert isinstance(chunks, list)


# ─────────────────────────────────────────────────────────────────────────────
# Context building
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_subject_and_mode_accepted(monkeypatch):
    """Passing subject_id, subject_name, and mode must not crash."""
    async def _chat(**kw):
        return _stream("Understood.")

    mock_client = MagicMock()
    mock_client.chat = _chat
    monkeypatch.setattr(loop_module, "_client", mock_client)

    chunks = await _collect(run_agent(
        user_message="Explain Newton's laws",
        user_id=1,
        conversation_history=[{"role": "user", "content": "Hi"}],
        topic_scores=[{"id": 1, "name": "Mechanics", "confidence_score": 45.0}],
        subject_id=1,
        subject_name="Physics",
        mode="exam",
    ))
    assert isinstance(chunks, list)
