"""
Mimir — Exam Paper Parser
=========================
Detects whether an uploaded PDF is an exam paper and, if so, extracts every
question with its mark allocation so the Oracle can automatically calibrate
answer depth and length to the marks at stake.

Detection heuristic
-------------------
A document is treated as an exam paper when the first 6 000 characters
contain ≥ 2 mark-allocation tokens AND ≥ 2 question-number patterns.

Supported mark formats (case-insensitive)
-----------------------------------------
  [4 marks]   (4 marks)   marks: 4   [4]   /4 (at line end)   (4) (at line end)

Supported question-number prefixes
------------------------------------
  1.   1)   Q1   Q1a   Question 1   1(a)   (a)   (i)   a.   a)

Usage
-----
    from utils.exam_parser import is_exam_paper, parse_exam_questions

    text = extract_pdf(path)
    if is_exam_paper(text):
        questions = parse_exam_questions(text, filename="paper.pdf")
        # questions: list[ParsedQuestion]
"""

import re
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("mimir.exam_parser")


# ── Mark-allocation regex patterns ───────────────────────────
# Ordered most → least specific to avoid false positives.
# Each captures the digit(s) as group 1.
_MARK_PATTERNS: list[re.Pattern] = [
    re.compile(r"\[(\d{1,2})\s+marks?\]",       re.IGNORECASE),  # [4 marks]
    re.compile(r"\((\d{1,2})\s+marks?\)",        re.IGNORECASE),  # (4 marks)
    re.compile(r"marks?\s*[=:]\s*(\d{1,2})",     re.IGNORECASE),  # marks: 4 / marks=4
    re.compile(r"\[(\d{1,2})\]"),                                  # [4]
    re.compile(r"/\s*(\d{1,2})\s*$"),                              # /4  at end of line
    # (4) only at end of line — avoids grabbing "(a)" question labels
    re.compile(r"\((\d{1,2})\)\s*$"),
]

# ── Question-number prefix patterns ──────────────────────────
# Match at the START of a stripped line.
_QUESTION_START = re.compile(
    r"^(?:"
    # Q1 / Q1a / Q 1 / Question 1 / Question 1a / Question 1(a)
    r"(?:Q(?:uestion)?\s*\.?\s*(\d+)\s*(?:[.(]?\s*[a-z]{1,3}\s*[.)]?)?)"
    r"|"
    # 1. / 1) / 1a) / 1.(a) / 1(a)
    r"(?:(\d+)\s*[.)]?\s*(?:[a-z]{1,3}\s*[.)])?\s*)"
    r"|"
    # (a) / (ii) / (iii) — standalone sub-question letter/roman
    r"(?:\(\s*([a-z]{1,4})\s*\))"
    r"|"
    # a. / a) — single letter prefix
    r"(?:([a-zA-Z])\s*[.)])"
    r")",
    re.IGNORECASE,
)

# Lines that look like question numbers but are actually headings/section labels
_SECTION_NOISE = re.compile(
    r"^(?:section|part|instructions?|answer\s+all|time\s+allowed|total\s+marks?)",
    re.IGNORECASE,
)


@dataclass
class ParsedQuestion:
    """One extracted exam question with its mark allocation."""
    question_number: str             # e.g. "1a", "Q2", "(b)"
    question_text:   str             # cleaned question text (max 500 chars)
    marks:           int             # mark allocation
    page_number:     int = field(default=0)


# ── Public API ────────────────────────────────────────────────

def is_exam_paper(text: str) -> bool:
    """Return True when *text* looks like an exam paper.

    Requires ≥ 2 mark-allocation tokens AND ≥ 2 question-number lines in the
    first 6 000 characters.  This threshold is deliberately conservative so
    regular notes / textbook chapters are not mis-classified.
    """
    sample = text[:6000]

    total_mark_tokens = sum(
        len(pat.findall(sample)) for pat in _MARK_PATTERNS
    )
    q_hits = len(_QUESTION_START.findall(sample))

    return total_mark_tokens >= 2 and q_hits >= 2


def parse_exam_questions(
    text: str,
    filename: str = "",
) -> list[ParsedQuestion]:
    """Extract all questions and their mark allocations from exam *text*.

    Algorithm
    ---------
    1. Split text into lines.
    2. When a question-number prefix is detected, open a new "current question"
       accumulator.
    3. Mark allocations found on any line within the question body are
       associated with that question.
    4. The question is *emitted* when the next question-number line starts,
       capping the body at 8 lines to avoid merging entire sections.

    Returns a deduplicated list of :class:`ParsedQuestion` objects (only
    those with a mark allocation > 0 are included).
    """
    questions:  list[ParsedQuestion] = []
    lines = text.split("\n")

    cur_num:    str = ""
    cur_text:   list[str] = []
    cur_marks:  int | None = None
    cur_page:   int = 0

    def _extract_marks(line: str) -> int | None:
        """Return the first valid mark count found in *line*, or None."""
        for pat in _MARK_PATTERNS:
            m = pat.search(line)
            if m:
                try:
                    val = int(m.group(1))
                    if 1 <= val <= 40:   # sanity guard — no single question > 40 marks
                        return val
                except (IndexError, ValueError):
                    pass
        return None

    def _strip_marks(text: str) -> str:
        """Remove mark annotations from *text*."""
        for pat in _MARK_PATTERNS:
            text = pat.sub("", text)
        return text.strip(" \t[]()./")

    def flush() -> None:
        nonlocal cur_num, cur_text, cur_marks, cur_page
        if cur_num and cur_marks is not None and cur_text:
            raw = " ".join(cur_text).strip()
            cleaned = _strip_marks(raw)
            if len(cleaned) >= 8:   # skip degenerate / near-empty lines
                questions.append(ParsedQuestion(
                    question_number=cur_num,
                    question_text=cleaned[:500],
                    marks=cur_marks,
                    page_number=cur_page,
                ))
        cur_num   = ""
        cur_text  = []
        cur_marks = None

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # ── Page-number header emitted by PyMuPDF ────────────
        page_m = re.match(r"^[Pp]age\s+(\d+)\s*$", line)
        if page_m:
            cur_page = int(page_m.group(1))
            continue

        # ── Section noise (headings that look like Q numbers) ─
        if _SECTION_NOISE.match(line):
            continue

        q_match = _QUESTION_START.match(line)
        if q_match:
            flush()
            # Use the full matched prefix as the question number label
            cur_num    = q_match.group(0).strip().rstrip(".()")
            rest       = line[q_match.end():].strip()
            cur_marks  = _extract_marks(line)   # marks may be inline
            if rest:
                cur_text.append(rest)
        elif cur_num:
            # Continuation of the current question body
            m = _extract_marks(line)
            if m and cur_marks is None:
                cur_marks = m
            cur_text.append(line)
            # Cap body accumulation to avoid swallowing the next question
            if len(cur_text) >= 10:
                flush()

    flush()   # emit the final question

    # ── Deduplicate by normalised question number ─────────────
    seen:   set[str] = set()
    result: list[ParsedQuestion] = []
    for q in questions:
        key = re.sub(r"\s+", "", q.question_number.lower())
        if key not in seen:
            seen.add(key)
            result.append(q)

    logger.info(
        "Exam parser: %d questions extracted from %r",
        len(result),
        filename or "<unknown>",
    )
    return result


def mark_scaling_guide() -> str:
    """Return the standard mark-scaling reference block for injection into prompts."""
    return (
        "Mark-allocation guide — scale answer depth accordingly:\n"
        "  1–2 marks  → one concise point or definition\n"
        "  3–4 marks  → 3–4 developed points or a short structured explanation\n"
        "  5–6 marks  → detailed explanation with examples or a diagram description\n"
        "  7–10 marks → comprehensive, well-structured response with analysis\n"
        " 11+ marks   → full essay-style answer: introduction, development, evaluation, conclusion"
    )
