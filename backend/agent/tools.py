"""
Mimir — Agent Tools
Each tool takes structured input and returns structured output.
Tools are called by the ReAct loop when the LLM selects an action.
"""

import json
import re
from datetime import datetime, timedelta, timezone

def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)
from typing import Any

import ollama

from config import settings
from agent.prompts import (
    EXPLAIN_PROMPT, QUIZ_PROMPT, SUMMARIZE_PROMPT,
    FLASHCARD_PROMPT, SCHEDULE_PROMPT, DIAGRAM_PROMPT,
)


# ── Ollama helper ────────────────────────────────────────────

def _llm(prompt: str, system: str = "") -> str:
    """Call the local Ollama model synchronously and return the response text.

    Intended for use inside ``asyncio.to_thread`` so it does not block the
    FastAPI event loop.
    """
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = ollama.chat(
        model=settings.ollama_model,
        messages=messages,
        options={
            "temperature": settings.ollama_temperature,
            "num_ctx": settings.ollama_context_length,
        },
        think=False,
    )
    return response["message"]["content"]


def _parse_json(text: str) -> Any:
    """Extract and parse the first complete JSON object or array from LLM output.

    Tries three strategies in order:
    1. Direct ``json.loads`` on the stripped text (fast path for clean output).
    2. Depth-aware bracket scan to find the first balanced ``[…]`` or ``{…}`` block.
    3. Greedy regex as a last resort.

    Raises ``json.JSONDecodeError`` if all strategies fail.
    """
    # Fast path: the model returned clean JSON directly
    stripped = text.strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # Depth-aware extraction: find the first complete [...] or {...} block
    for open_ch, close_ch in (("[", "]"), ("{", "}")):
        start = stripped.find(open_ch)
        if start == -1:
            continue
        depth = 0
        for i, ch in enumerate(stripped[start:], start):
            if ch == open_ch:
                depth += 1
            elif ch == close_ch:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(stripped[start : i + 1])
                    except json.JSONDecodeError:
                        break

    # Last resort: greedy regex (handles text with preamble/postamble)
    match = re.search(r"(\[.*\]|\{.*\})", stripped, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    return json.loads(stripped)


# ── Tool: explain ────────────────────────────────────────────

def tool_explain(concept: str, depth: str = "intermediate") -> str:
    """
    Explain a concept at the requested depth.
    depth: 'beginner' | 'intermediate' | 'advanced'
    Returns: Markdown string.
    """
    prompt = EXPLAIN_PROMPT.format(concept=concept, depth=depth)
    return _llm(prompt)


# ── Tool: quiz ───────────────────────────────────────────────

def tool_quiz(topic: str, subject: str = "", n: int = 5, difficulty: str = "medium") -> list[dict]:
    """
    Generate n MCQ questions about a topic at the given difficulty.

    Args:
        topic:      The concept to quiz on.
        subject:    Broader subject context (optional).
        n:          Number of questions to generate.
        difficulty: One of ``"easy" | "medium" | "hard" | "expert"``.

    Returns:
        list of {question, options, answer (int), explanation}
    """
    valid_difficulties = {"easy", "medium", "hard", "expert"}
    if difficulty not in valid_difficulties:
        difficulty = "medium"
    try:
        prompt = QUIZ_PROMPT.format(topic=topic, subject=subject, n=n, difficulty=difficulty)
        raw = _llm(prompt)
        questions = _parse_json(raw)
        return questions
    except Exception:
        return []


# ── Tool: summarize ──────────────────────────────────────────

def tool_summarize(content: str) -> str:
    """
    Summarize raw text (e.g., from a PDF) into study notes.
    Returns: Markdown string.
    """
    prompt = SUMMARIZE_PROMPT.format(content=content[:8000])  # cap to context window
    return _llm(prompt)


# ── Tool: flashcards ─────────────────────────────────────────

def tool_flashcards(topic: str, n: int = 10) -> list[dict]:
    """
    Generate n Q&A flashcard pairs on a topic.
    Returns: list of {front, back}
    """
    prompt = FLASHCARD_PROMPT.format(topic=topic, n=n)
    raw = _llm(prompt)
    try:
        return _parse_json(raw)
    except (json.JSONDecodeError, AttributeError):
        return []


# ── Tool: schedule ───────────────────────────────────────────

def tool_schedule(
    subject: str,
    topics: list[str],
    days_until_exam: int,
    weak_topics: list[str],
) -> str:
    """
    Build a day-by-day revision schedule.
    Returns: Markdown plan.
    """
    prompt = SCHEDULE_PROMPT.format(
        subject=subject,
        topics=", ".join(topics),
        days=days_until_exam,
        weak_topics=", ".join(weak_topics) if weak_topics else "none identified yet",
    )
    return _llm(prompt)


# ── Tool: recall ─────────────────────────────────────────────

def tool_recall(past_messages: list[dict]) -> str:
    """
    Summarize what the user has studied in past sessions.
    past_messages: list of {role, content}
    Returns: brief summary string.
    """
    if not past_messages:
        return "No past sessions found."

    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content'][:200]}"
        for m in past_messages[:20]
    )
    prompt = f"Briefly summarize what topics this student has been studying:\n\n{history_text}"
    return _llm(prompt)


# ── Tool: weak_topics ────────────────────────────────────────

def tool_weak_topics(topic_scores: list[dict]) -> list[dict]:
    """
    Given a list of {topic, confidence_score}, return topics sorted by score (ascending).
    Scores below 60 are considered weak.
    Returns: [{"topic": str, "score": float, "status": str}]
    """
    if not topic_scores:
        return []

    sorted_topics = sorted(topic_scores, key=lambda t: t.get("confidence_score", 0))

    result = []
    for t in sorted_topics:
        score = t.get("confidence_score", 0)
        status = (
            "critical" if score < 40 else
            "weak"     if score < 60 else
            "moderate" if score < 80 else
            "strong"
        )
        result.append({
            "topic": t.get("name", "Unknown"),
            "score": round(score, 1),
            "status": status,
        })
    return result


# ── Tool: diagram ────────────────────────────────────────────

_MERMAID_TYPES = (
    "graph ", "flowchart ", "sequenceDiagram", "stateDiagram",
    "classDiagram", "erDiagram", "mindmap", "journey", "gantt", "pie",
)

# Mermaid ids that are reserved words; a node called `in` or `end` kills the parse.
_RESERVED_IDS = {"in", "out", "end", "graph", "class", "style", "click", "subgraph"}


def _sanitize_mermaid(code: str) -> str:
    """Repair the Mermaid mistakes local models actually make.

    The prompt forbids all of these, but a 9B model slips often enough that
    instructions alone mean a broken diagram on screen. Observed in the wild:
    invented arrows (``~~~>``, ``==>*``, ``-.-.>``), ampersands and plus signs
    inside labels (both are Mermaid operators, not punctuation), nodes named
    after reserved words, and — the one nothing can safely repair — `subgraph`
    blocks left unclosed. Grouping is therefore stripped entirely rather than
    guessed at: a flat diagram that draws beats a grouped one that does not.

    Every rule below is flowchart grammar, so this only runs on ``graph`` and
    ``flowchart`` sources. Applied to a sequence diagram it was *causing*
    failures: ``Client->>Server: SYN`` is valid there, and rewriting ``->>``
    into ``-->`` then collapsing the message text into a node id broke output
    the model had produced correctly.
    """
    first = code.lstrip().splitlines()[0].strip().lower() if code.strip() else ""
    if not first.startswith(("graph ", "flowchart ")):
        return code
    # Drop grouping wholesale. Unbalanced subgraph/end is the single biggest
    # cause of a failed parse, and the nodes inside are still declared, so the
    # diagram survives as a flat graph.
    lines = [
        ln for ln in code.splitlines()
        if not re.match(r"\s*(subgraph\b|end\s*$|direction\b)", ln, re.IGNORECASE)
    ]
    code = "\n".join(lines)

    # The model sometimes writes the diagram as a comma-separated list, leaving
    # a trailing comma on each edge line. Mermaid reads it as another statement.
    code = re.sub(r"(?m),\s*$", "", code)

    # `A --|label| B` is an arrow with the head missing.
    code = re.sub(r"--\|([^|\n]*)\|", r"-->|\1|", code)

    # Labels are where most breakage lives: the model writes arrows, ampersands
    # and shape brackets inside them, all of which Mermaid reads as syntax.
    # Rather than chase individual characters, reduce every label to a safe
    # character set and force it into double quotes.
    def _clean_text(raw: str) -> str:
        txt = raw.strip().strip('"').strip("'")
        txt = txt.strip("()").strip()          # stadium/round shapes: [(x)]
        txt = re.sub(r"-+\.?-*>", " to ", txt)  # arrows written inside a label
        txt = txt.replace("&", " and ").replace("+", " plus ").replace("@", " at ")
        txt = re.sub(r"[^A-Za-z0-9 ,.\-_/]", " ", txt)
        txt = re.sub(r"\s+", " ", txt).strip(" -")
        return txt or "node"

    code = re.sub(
        r"\[[^\]\n]*\]",
        lambda m: f'["{_clean_text(m.group(0)[1:-1])}"]',
        code,
    )
    code = re.sub(
        r"\|[^|\n]*\|",
        lambda m: f"|{_clean_text(m.group(0)[1:-1])}|",
        code,
    )

    # Bracket debris left after a well-formed label — `w1["Weights"]"]` or
    # `w2["Weights"]")` — from the model closing the group twice.
    code = re.sub(r"(\[\"[^\"\n]*\"\])[\"'\)\]]+", r"\1", code)

    # A node carrying two label groups — `H["a"]["b"]` — is a parse error. Keep
    # the first and drop the rest.
    code = re.sub(r"(\[\"[^\"\n]*\"\])(\s*\[\"[^\"\n]*\"\])+", r"\1", code)

    # ── Arrows, once labels are already safe ────────────────
    # Runs last so it cannot touch words inside a label: by this point every
    # label is quoted and stripped of arrow characters.
    #
    # `A -- text --> B` is valid Mermaid, but the model decorates it with stray
    # pipes and slashes (`-- Yes |-->`, `-- No |--/-->`). Rewrite the whole form
    # into the canonical `A -->|text| B`.
    code = re.sub(
        r"--\s*([A-Za-z0-9][A-Za-z0-9 ,_-]{0,38}?)\s*[|/\\]*\s*-{1,}\.?-*>",
        lambda m: f"-->|{m.group(1).strip()}|",
        code,
    )

    # Then collapse any remaining run of arrow-ish characters onto one of the
    # two valid forms, dotted if the run contains a dot. Enumerating broken
    # variants individually kept missing the next invention (`==>*`, `-.-.>`,
    # `->>`), so this covers them by construction. `>{1,}` catches the
    # sequence-diagram arrows the model borrows into flowcharts.
    code = re.sub(
        r"([-.=~]{1,})>{1,}\*?",
        lambda m: "-.->" if "." in m.group(1) else "-->",
        code,
    )

    # Node ids may not contain spaces. The model writes things like
    # `X activations["..."]`. Renaming only the declaration would leave the
    # edges pointing at a node that no longer exists, so collect the renames
    # first and apply them everywhere — declaration and references alike.
    renames: dict[str, str] = {}
    for m in re.finditer(r"(?m)^\s*([A-Za-z][A-Za-z0-9_ ]*?)\s*\[\"", code):
        ident = m.group(1).strip()
        if " " in ident:
            renames[ident] = re.sub(r"[^A-Za-z0-9_]", "_", ident)

    # Longest first, so "X activations" is handled before a shorter prefix.
    for old in sorted(renames, key=len, reverse=True):
        code = re.sub(rf"(?<![\w\"]){re.escape(old)}(?![\w\"])", renames[old], code)

    # Rename reserved ids (`in` -> `in_`) wherever they appear as a whole word,
    # whether declaring the node or referencing it at either end of an edge.
    # MULTILINE matters: an id used as an edge target sits at end of line, and
    # without it only some occurrences get renamed — which silently splits one
    # node into two and draws a disconnected graph.
    for word in _RESERVED_IDS - {"end", "subgraph", "graph", "style", "class", "click"}:
        code = re.sub(
            rf"(?<![\w\"]){word}(?![\w\"])",
            f"{word}_",
            code,
            flags=re.MULTILINE,
        )

    # An edge endpoint can also be a multi-word id that was never declared
    # anywhere — `ATPNADPH -.-> powers calvinCycle`. The rename pass above only
    # inspects declarations, so collapse both endpoints of every edge directly.
    def _fix_endpoint(tok: str) -> str:
        tok = tok.strip()
        if not tok:
            return tok
        m = re.match(r"^([^\[\n]+?)\s*(\[.*\])?$", tok)
        if not m:
            return tok
        # No underscore stripping here: the reserved-word pass above renames
        # `in` to `in_`, and trimming that trailing underscore would hand the
        # reserved word straight back to the parser.
        ident = re.sub(r"[^A-Za-z0-9_]", "_", m.group(1).strip())
        return (ident.strip() or "n") + (m.group(2) or "")

    def _fix_edge(m: re.Match) -> str:
        indent, lhs, arrow, label, rhs = m.groups()
        return f"{indent}{_fix_endpoint(lhs)} {arrow}{label or ''} {_fix_endpoint(rhs)}"

    code = re.sub(
        r"(?m)^(\s*)(.+?)\s*(-->|-\.->)\s*(\|[^|\n]*\|)?\s*(.+?)\s*$",
        _fix_edge,
        code,
    )

    return code


def tool_diagram(description: str, **_ignored) -> dict:
    """Generate a Mermaid diagram for a concept.

    Exists because the model used to answer "I cannot draw an image directly"
    when a student asked to see something — the agent had no visual tool at all,
    even though the app can render one. The frontend renders the returned source
    with Mermaid, so the student gets an actual diagram in the chat.

    Args:
        description: What to draw, in natural language.

    Returns:
        ``{"type": "mermaid", "code": str}`` on success, or a dict with an
        ``error`` key that the UI shows as text. The dict return means the agent
        loop forwards it to the browser as structured tool data rather than
        letting the model paraphrase it away.
    """
    # Plain replace rather than str.format: this prompt is full of Mermaid and
    # LaTeX samples containing braces, which format() would try to interpret.
    raw = _llm(DIAGRAM_PROMPT.replace("{description}", description)).strip()

    # Strip code fences the model adds despite being told not to.
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw).strip()

    # Drop any preamble before the first real Mermaid directive.
    lines = raw.splitlines()
    for idx, line in enumerate(lines):
        if line.strip().startswith(_MERMAID_TYPES):
            raw = "\n".join(lines[idx:]).strip()
            break
    else:
        return {"type": "mermaid", "error": "Could not produce a valid diagram.", "code": ""}

    # LaTeX inside a Mermaid label breaks the parse; the prompt forbids it but
    # models slip, so strip the delimiters rather than fail the whole diagram.
    raw = raw.replace("$", "")

    return {"type": "mermaid", "code": _sanitize_mermaid(raw)}


# ── Tool: web_search ─────────────────────────────────────────

def tool_web_search(query: str, n: int = 5) -> str:
    """Search the public web via DuckDuckGo and return result snippets.

    Only reachable when the student has switched the Web Search toggle on —
    the tool is not registered with the agent otherwise, so Mimir stays fully
    offline by default.  Used to ground answers about current facts (hardware
    specs, recent releases, figures) that the local model may not know or may
    misremember.

    Args:
        query: Natural-language search query.
        n: How many results to return (clamped to 1-8).

    Returns:
        A numbered plain-text digest of titles, snippets and URLs, or an
        explanatory message when the search fails or returns nothing. The
        agent is instructed to cite these sources in its answer.
    """
    n = max(1, min(int(n or 5), 8))
    try:
        from ddgs import DDGS
    except ImportError:
        return "Web search unavailable: the 'ddgs' package is not installed."

    try:
        results = list(DDGS().text(query, max_results=n))
    except Exception as exc:
        return (
            f"Web search failed ({type(exc).__name__}). "
            "You are offline or the search service is unreachable — "
            "answer from your own knowledge and say you could not verify online."
        )

    if not results:
        return f"No web results found for: {query}"

    lines = [f"Web search results for: {query}", ""]
    for i, r in enumerate(results, 1):
        title = (r.get("title") or "").strip()
        body  = (r.get("body") or "").strip()[:400]
        href  = (r.get("href") or "").strip()
        lines.append(f"[{i}] {title}\n{body}\nSource: {href}\n")
    return "\n".join(lines)


# ── Spaced Repetition (SM-2) ─────────────────────────────────

def compute_sm2(
    score: int,
    total: int,
    ease_factor: float = 2.5,
    repetitions: int = 0,
    interval: int = 1,
) -> tuple[float, int, int, datetime]:
    """Full SM-2 spaced-repetition algorithm.

    Maps the quiz percentage to a quality rating (0–5), then applies the
    standard SM-2 update rules for ease factor, repetition count, and
    inter-repetition interval.

    Quality mapping:
        90%+  → 5 (perfect)     80–89% → 4     70–79% → 3 (pass threshold)
        60–69% → 2 (fail)       40–59% → 1      <40%  → 0 (complete fail)

    Args:
        score:       Number of correct answers.
        total:       Total number of questions.
        ease_factor: Current ease factor for the topic (default 2.5).
        repetitions: Number of consecutive successful reviews (default 0).
        interval:    Current inter-repetition interval in days (default 1).

    Returns:
        ``(new_ease_factor, new_repetitions, new_interval, next_review_datetime)``
    """
    pct = (score / total * 100) if total > 0 else 0

    # Map percentage to SM-2 quality (0–5)
    if pct >= 90:
        quality = 5
    elif pct >= 80:
        quality = 4
    elif pct >= 70:
        quality = 3
    elif pct >= 60:
        quality = 2   # borderline fail
    elif pct >= 40:
        quality = 1
    else:
        quality = 0

    if quality >= 3:
        # Successful recall — advance the schedule
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)

        # SM-2 ease factor update (min 1.3)
        new_ease = ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        new_ease = max(1.3, round(new_ease, 3))
        new_reps = repetitions + 1
    else:
        # Failed recall — reset repetitions and shorten interval
        new_interval = 1
        new_reps = 0
        new_ease = max(1.3, round(ease_factor - 0.2, 3))

    # Cap at 365 days to stay practical
    new_interval = min(new_interval, 365)

    next_review = _utcnow() + timedelta(days=new_interval)
    return new_ease, new_reps, new_interval, next_review


def compute_next_review(score: int, total: int) -> datetime:
    """Legacy wrapper — returns only the next_review datetime using SM-2 defaults.

    Kept for any callers that only need the datetime and don't track SM-2 state.
    """
    _, _, _, next_review = compute_sm2(score, total)
    return next_review
