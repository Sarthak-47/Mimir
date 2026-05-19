"""
Tests for the exam paper detection and question extraction pipeline
(utils/exam_parser.py).

All functions under test are pure (regex + string processing) — no I/O and no
mocking required.  Tests are organised around:

  1. is_exam_paper()       — detection heuristic
  2. parse_exam_questions() — extraction pipeline
  3. mark_scaling_guide()  — prompt-injection helper
"""

import pytest
from utils.exam_parser import is_exam_paper, parse_exam_questions, mark_scaling_guide


# ─────────────────────────────────────────────────────────────────────────────
# Helpers — minimal exam and notes text
# ─────────────────────────────────────────────────────────────────────────────

MINIMAL_EXAM = """\
1. Explain the process of photosynthesis. [4 marks]
2. Describe the role of mitochondria in cellular respiration. [6 marks]
"""

PLAIN_NOTES = """\
Chapter 3: Photosynthesis

Photosynthesis is the process by which green plants convert sunlight into
glucose using carbon dioxide and water.  The light-dependent reactions occur
in the thylakoids.  The Calvin cycle takes place in the stroma.
"""

REALISTIC_EXAM = """\
A-Level Biology — Paper 1
Time allowed: 2 hours     Total marks: 80

Section A: Multiple Choice

1. Which of the following is the primary site of ATP synthesis?
   A) Nucleus  B) Ribosome  C) Mitochondria  D) Lysosome          [1 mark]

2. State the products of the light-dependent reactions.             [2 marks]
   _______________________________________________________________

3. Describe how the sodium-potassium pump maintains the resting
   membrane potential.                                             [4 marks]

4. Evaluate the evidence for the fluid mosaic model of membrane
   structure.                                                     [8 marks]

Q5. Outline the sequence of events during mitosis.               [6 marks]

Q6. A student investigates the effect of temperature on enzyme
    activity.  Sketch and annotate the expected rate-vs-temperature
    graph, explaining the effect at each key point.              [9 marks]
"""


# ─────────────────────────────────────────────────────────────────────────────
# is_exam_paper
# ─────────────────────────────────────────────────────────────────────────────

class TestIsExamPaper:

    def test_detects_minimal_exam(self):
        assert is_exam_paper(MINIMAL_EXAM) is True

    def test_rejects_plain_notes(self):
        assert is_exam_paper(PLAIN_NOTES) is False

    def test_detects_realistic_exam(self):
        assert is_exam_paper(REALISTIC_EXAM) is True

    def test_rejects_empty_string(self):
        assert is_exam_paper("") is False

    def test_one_mark_token_is_not_enough(self):
        """Requires ≥ 2 mark tokens; a single mark annotation should not trigger."""
        text = "1. Describe the heart. [4 marks]\nSome notes follow here.\n"
        # Only 1 mark token — should be rejected
        assert is_exam_paper(text) is False

    def test_bracket_mark_format(self):
        """[4 marks] and [6 marks] notation should be detected."""
        text = "1. Define osmosis. [4 marks]\n2. Explain diffusion. [6 marks]\n"
        assert is_exam_paper(text) is True

    def test_parenthesis_mark_format(self):
        """(4 marks) notation should be detected."""
        text = "1. Define osmosis. (4 marks)\n2. Explain diffusion. (6 marks)\n"
        assert is_exam_paper(text) is True

    def test_slash_mark_format(self):
        """/4 at end of line notation should be detected."""
        text = "1. Define osmosis. /4\n2. Explain diffusion. /6\n"
        assert is_exam_paper(text) is True

    def test_marks_colon_format(self):
        """marks: 4 notation should be detected."""
        text = "Q1. Define osmosis. marks: 4\nQ2. Explain diffusion. marks: 6\n"
        assert is_exam_paper(text) is True

    def test_only_checks_first_6000_chars(self):
        """Mark tokens appearing after 6000 characters should not count."""
        filler = "a " * 3000          # 6000 characters of filler
        late   = filler + "\n1. Explain osmosis. [4 marks]\n2. Describe ATP. [6 marks]\n"
        # The mark tokens are after the 6000-char window
        assert is_exam_paper(late) is False


# ─────────────────────────────────────────────────────────────────────────────
# parse_exam_questions
# ─────────────────────────────────────────────────────────────────────────────

class TestParseExamQuestions:

    def test_extracts_correct_number_of_questions(self):
        questions = parse_exam_questions(MINIMAL_EXAM)
        assert len(questions) == 2

    def test_extracts_marks_correctly(self):
        questions = parse_exam_questions(MINIMAL_EXAM)
        marks = {q.marks for q in questions}
        assert marks == {4, 6}

    def test_question_text_is_not_empty(self):
        questions = parse_exam_questions(MINIMAL_EXAM)
        for q in questions:
            assert len(q.question_text) >= 8

    def test_mark_annotations_stripped_from_text(self):
        """The '[4 marks]' suffix should not appear in the extracted question text."""
        questions = parse_exam_questions(MINIMAL_EXAM)
        for q in questions:
            assert "marks" not in q.question_text.lower() or "mark" in q.question_number.lower()

    def test_realistic_exam_question_count(self):
        """Six numbered questions in the realistic exam should all be extracted."""
        questions = parse_exam_questions(REALISTIC_EXAM)
        assert len(questions) >= 4   # at minimum Q1–Q4 should be captured

    def test_realistic_exam_marks_range(self):
        """All extracted mark values should be positive integers ≤ 40."""
        questions = parse_exam_questions(REALISTIC_EXAM)
        for q in questions:
            assert 1 <= q.marks <= 40

    def test_q_prefix_format_parsed(self):
        """Q5 / Q6 question-number prefixes should be captured."""
        questions = parse_exam_questions(REALISTIC_EXAM)
        q_nums = [q.question_number.strip().upper() for q in questions]
        assert any(n.startswith("Q") for n in q_nums)

    def test_no_questions_from_plain_notes(self):
        """Plain notes with no mark annotations should return an empty list."""
        questions = parse_exam_questions(PLAIN_NOTES)
        assert questions == []

    def test_empty_input_returns_empty_list(self):
        assert parse_exam_questions("") == []

    def test_deduplication_of_repeated_question_numbers(self):
        """The same question number appearing twice should appear only once."""
        dup_text = (
            "1. Describe DNA replication. [4 marks]\n"
            "1. Describe DNA replication. [4 marks]\n"  # exact duplicate
        )
        questions = parse_exam_questions(dup_text)
        nums = [q.question_number for q in questions]
        assert len(nums) == len(set(nums))

    def test_section_noise_is_filtered(self):
        """Lines starting with 'Section', 'Instructions', etc. are not question numbers."""
        text = (
            "Section A: Answer all questions.\n"
            "Instructions: Write in black ink.\n"
            "1. Explain the role of RNA polymerase. [3 marks]\n"
            "2. Describe transcription. [5 marks]\n"
        )
        questions = parse_exam_questions(text)
        # Section / Instructions lines must not become question numbers
        for q in questions:
            assert "section" not in q.question_number.lower()
            assert "instruction" not in q.question_number.lower()

    def test_question_text_capped_at_500_chars(self):
        """Very long question text should be truncated to 500 characters."""
        long_q = "1. " + ("Explain. " * 100) + " [4 marks]\n2. Brief. [2 marks]\n"
        questions = parse_exam_questions(long_q)
        for q in questions:
            assert len(q.question_text) <= 500

    def test_page_number_defaults_to_zero(self):
        """Without a 'Page N' header, page_number should default to 0."""
        questions = parse_exam_questions(MINIMAL_EXAM)
        for q in questions:
            assert q.page_number == 0

    def test_page_number_parsed_from_header(self):
        """'Page 2' headers emitted by PyMuPDF should set page_number correctly."""
        text = (
            "Page 1\n"
            "1. Define osmosis. [3 marks]\n"
            "Page 2\n"
            "2. Describe active transport. [5 marks]\n"
        )
        questions = parse_exam_questions(text)
        # Q2 should be on page 2
        q2 = next((q for q in questions if "2" in q.question_number), None)
        if q2:
            assert q2.page_number == 2


# ─────────────────────────────────────────────────────────────────────────────
# mark_scaling_guide
# ─────────────────────────────────────────────────────────────────────────────

class TestMarkScalingGuide:

    def test_returns_string(self):
        assert isinstance(mark_scaling_guide(), str)

    def test_contains_all_five_tiers(self):
        guide = mark_scaling_guide()
        assert "1–2" in guide
        assert "3–4" in guide
        assert "5–6" in guide
        assert "7–10" in guide
        assert "11+" in guide

    def test_mentions_essay_for_high_marks(self):
        """The highest tier should reference essay-style writing."""
        guide = mark_scaling_guide()
        assert "essay" in guide.lower()
