"""
Tests for pure helper functions in agent/tools.py.

These tests cover the functions that contain non-trivial logic but do NOT
call Ollama or touch the database:

  - _parse_json()       — multi-strategy JSON extraction from LLM output
  - tool_weak_topics()  — sorts topics by score and assigns status labels
"""

import json
import pytest

from agent.tools import tool_weak_topics

# Import the private helper directly for unit testing
from agent import tools as _tools_module
_parse_json = _tools_module._parse_json


# ─────────────────────────────────────────────────────────────────────────────
# _parse_json — JSON extraction from noisy LLM output
# ─────────────────────────────────────────────────────────────────────────────

class TestParseJson:
    """_parse_json must extract valid JSON from a range of LLM output formats."""

    def test_clean_array(self):
        """Direct JSON array with no surrounding text."""
        result = _parse_json('[{"a": 1}, {"b": 2}]')
        assert result == [{"a": 1}, {"b": 2}]

    def test_clean_object(self):
        """Direct JSON object."""
        result = _parse_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_array_with_preamble(self):
        """LLM sometimes prefaces JSON with a sentence."""
        raw = 'Here are your questions:\n[{"q": "What is ATP?", "answer": 2}]'
        result = _parse_json(raw)
        assert isinstance(result, list)
        assert result[0]["q"] == "What is ATP?"

    def test_array_with_postamble(self):
        """LLM sometimes adds commentary after the JSON."""
        raw = '[{"front": "Osmosis", "back": "Water movement"}]\nHope that helps!'
        result = _parse_json(raw)
        assert isinstance(result, list)
        assert result[0]["front"] == "Osmosis"

    def test_array_wrapped_in_markdown_code_fence(self):
        """LLMs frequently wrap JSON in ```json ... ``` blocks."""
        raw = '```json\n[{"question": "Define entropy.", "options": ["A","B"], "answer": 0}]\n```'
        result = _parse_json(raw)
        assert isinstance(result, list)

    def test_nested_json(self):
        """Nested objects must parse without truncation."""
        data = {"questions": [{"q": "Q1", "marks": 4}]}
        raw  = json.dumps(data)
        assert _parse_json(raw) == data

    def test_invalid_json_raises(self):
        """Completely unparseable text should raise json.JSONDecodeError."""
        with pytest.raises(json.JSONDecodeError):
            _parse_json("this is not json at all !@#")

    def test_empty_array(self):
        assert _parse_json("[]") == []

    def test_empty_object(self):
        assert _parse_json("{}") == {}


# ─────────────────────────────────────────────────────────────────────────────
# tool_weak_topics — scoring and status labelling
# ─────────────────────────────────────────────────────────────────────────────

class TestToolWeakTopics:
    """tool_weak_topics must sort ascending by score and assign correct status labels."""

    SAMPLE = [
        {"name": "Thermodynamics",  "confidence_score": 35.0},
        {"name": "Quantum Mechanics", "confidence_score": 72.0},
        {"name": "Optics",          "confidence_score": 55.0},
        {"name": "Mechanics",       "confidence_score": 90.0},
    ]

    def _run(self, scores=None):
        return tool_weak_topics(scores or self.SAMPLE)

    def test_returns_list(self):
        assert isinstance(self._run(), list)

    def test_sorted_ascending_by_score(self):
        result = self._run()
        scores = [r["score"] for r in result]
        assert scores == sorted(scores)

    def test_all_entries_have_required_keys(self):
        result = self._run()
        for item in result:
            assert "topic"  in item
            assert "score"  in item
            assert "status" in item

    def test_critical_status_below_40(self):
        result = self._run()
        thermo = next(r for r in result if r["topic"] == "Thermodynamics")
        assert thermo["status"] == "critical"

    def test_weak_status_40_to_59(self):
        result = self._run()
        optics = next(r for r in result if r["topic"] == "Optics")
        assert optics["status"] == "weak"

    def test_moderate_status_60_to_79(self):
        result = self._run()
        quantum = next(r for r in result if r["topic"] == "Quantum Mechanics")
        assert quantum["status"] == "moderate"

    def test_strong_status_80_plus(self):
        result = self._run()
        mechanics = next(r for r in result if r["topic"] == "Mechanics")
        assert mechanics["status"] == "strong"

    def test_empty_input_returns_empty_list(self):
        assert tool_weak_topics([]) == []

    def test_score_is_rounded(self):
        """Scores should be rounded to 1 decimal place for display."""
        data = [{"name": "Waves", "confidence_score": 67.333333}]
        result = tool_weak_topics(data)
        # Check it's rounded, not a raw float with many decimals
        score_str = str(result[0]["score"])
        assert len(score_str.split(".")[-1]) <= 1

    def test_missing_confidence_score_treated_as_zero(self):
        """A topic row with no 'confidence_score' key should not crash."""
        data = [
            {"name": "No Score Topic"},
            {"name": "Normal Topic", "confidence_score": 75.0},
        ]
        result = tool_weak_topics(data)
        assert len(result) == 2
        no_score = next(r for r in result if r["topic"] == "No Score Topic")
        assert no_score["status"] == "critical"  # score=0 → critical

    def test_exactly_40_is_weak_not_critical(self):
        """Boundary: score == 40 is 'weak', not 'critical'."""
        data = [{"name": "Boundary", "confidence_score": 40.0}]
        result = tool_weak_topics(data)
        assert result[0]["status"] == "weak"

    def test_exactly_60_is_moderate_not_weak(self):
        """Boundary: score == 60 is 'moderate', not 'weak'."""
        data = [{"name": "Boundary", "confidence_score": 60.0}]
        result = tool_weak_topics(data)
        assert result[0]["status"] == "moderate"

    def test_exactly_80_is_strong_not_moderate(self):
        """Boundary: score == 80 is 'strong', not 'moderate'."""
        data = [{"name": "Boundary", "confidence_score": 80.0}]
        result = tool_weak_topics(data)
        assert result[0]["status"] == "strong"
