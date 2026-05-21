"""
Mimir — Formula & Definition Sheet Router.

Endpoint:
    GET /api/formulas?subject_id={id}

Pulls every document chunk indexed for the given subject from ChromaDB,
feeds them to the local LLM, and returns a structured sheet of formulas
and key definitions extracted from the user's own notes.

The generation is intentionally stateless — no caching — so the sheet
always reflects the latest uploaded documents.
"""

import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from memory.database import User, get_db  # noqa: F401 — get_db imported for type hint
from memory.vector import get_collection
from agent.tools import _llm
from routers.users import get_current_user

router = APIRouter()

# Maximum total characters fed to the LLM.  Keeps the prompt inside the
# model's context window even on very large note collections.
_MAX_CONTEXT_CHARS = 8_000


# ── Schemas ──────────────────────────────────────────────────

class FormulaEntry(BaseModel):
    name:    str
    formula: str          # the raw equation / expression
    notes:   str = ""     # units, conditions, derivation hint


class DefinitionEntry(BaseModel):
    term:       str
    definition: str


class FormulaSheetResponse(BaseModel):
    formulas:       list[FormulaEntry]
    definitions:    list[DefinitionEntry]
    subject_id:     int | None
    chunks_used:    int           # how many ChromaDB chunks were fed to the LLM
    empty:          bool          # True when no documents found for subject


# ── Helpers ──────────────────────────────────────────────────

def _fetch_subject_chunks(user_id: int, subject_id: int | None) -> list[str]:
    """Return all document-role chunks for (user, subject) from ChromaDB."""
    collection = get_collection()
    try:
        if subject_id is not None:
            where: dict = {
                "$and": [
                    {"user_id":   {"$eq": str(user_id)}},
                    {"role":      {"$eq": "document"}},
                    {"subject_id":{"$eq": str(subject_id)}},
                ]
            }
        else:
            where = {
                "$and": [
                    {"user_id": {"$eq": str(user_id)}},
                    {"role":    {"$eq": "document"}},
                ]
            }

        result = collection.get(where=where, include=["documents"])
        docs: list[str] = result.get("documents") or []
        return docs
    except Exception:
        return []


def _build_context(chunks: list[str]) -> str:
    """Concatenate chunks into a single context string, capped at _MAX_CONTEXT_CHARS."""
    parts: list[str] = []
    total = 0
    for chunk in chunks:
        if total + len(chunk) > _MAX_CONTEXT_CHARS:
            # Append partial chunk if space remains
            remaining = _MAX_CONTEXT_CHARS - total
            if remaining > 100:
                parts.append(chunk[:remaining])
            break
        parts.append(chunk)
        total += len(chunk)
    return "\n\n---\n\n".join(parts)


def _parse_llm_output(raw: str) -> tuple[list[FormulaEntry], list[DefinitionEntry]]:
    """Parse the LLM JSON output into FormulaEntry and DefinitionEntry lists."""
    stripped = raw.strip()
    data: dict = {}
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", stripped, re.DOTALL)
        if not m:
            return [], []
        try:
            data = json.loads(m.group())
        except json.JSONDecodeError:
            return [], []

    formulas: list[FormulaEntry] = []
    for item in data.get("formulas", []):
        if not isinstance(item, dict):
            continue
        name    = str(item.get("name",    "")).strip()
        formula = str(item.get("formula", "")).strip()
        notes   = str(item.get("notes",   "")).strip()
        if name and formula:
            formulas.append(FormulaEntry(name=name, formula=formula, notes=notes))

    definitions: list[DefinitionEntry] = []
    for item in data.get("definitions", []):
        if not isinstance(item, dict):
            continue
        term = str(item.get("term",       "")).strip()
        defn = str(item.get("definition", "")).strip()
        if term and defn:
            definitions.append(DefinitionEntry(term=term, definition=defn))

    return formulas, definitions


# ── Endpoint ─────────────────────────────────────────────────

@router.get("/", response_model=FormulaSheetResponse)
async def get_formula_sheet(
    subject_id: int | None = Query(None, description="Subject to pull notes from; omit for all subjects"),
    current_user: User = Depends(get_current_user),
):
    """Generate a formula and definition sheet from the user's uploaded notes.

    Retrieves all ChromaDB document chunks for the given subject, concatenates
    them (capped at 8 000 chars), then asks the LLM to extract every formula
    and key definition it can find.  Returns a structured JSON sheet.

    Returns an empty sheet (``empty: true``) if no documents have been uploaded
    for the subject yet — no LLM call is made in that case.
    """
    # 1. Fetch all document chunks for this subject
    chunks = await asyncio.to_thread(_fetch_subject_chunks, current_user.id, subject_id)

    if not chunks:
        return FormulaSheetResponse(
            formulas=[],
            definitions=[],
            subject_id=subject_id,
            chunks_used=0,
            empty=True,
        )

    # 2. Build context string
    context = _build_context(chunks)
    chunks_used = min(len(chunks), context.count("---") + 1)

    # 3. Ask the LLM to extract formulas and definitions
    prompt = (
        "You are extracting study material from the notes below.\n\n"
        "Return a JSON object with exactly two keys:\n"
        '  "formulas"    — array of every mathematical formula, equation, law, or constant\n'
        '  "definitions" — array of every key term and its definition\n\n'
        "Each formula entry:\n"
        '  { "name": "<human-readable name>", "formula": "<the equation/expression>", "notes": "<units, conditions, or short explanation — empty string if none>" }\n\n'
        "Each definition entry:\n"
        '  { "term": "<term>", "definition": "<concise definition>" }\n\n'
        "Rules:\n"
        "- If a formula has no clear name, infer one from context.\n"
        "- Preserve the exact symbols used in the source (e.g. Greek letters, ², ∫).\n"
        "- Include only items explicitly present in the notes — do not invent content.\n"
        "- Return plain JSON only. No markdown, no preamble, no trailing commentary.\n\n"
        "Notes:\n"
        "--------\n"
        f"{context}\n"
        "--------\n\n"
        "JSON:"
    )

    try:
        raw = await asyncio.to_thread(_llm, prompt)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    formulas, definitions = _parse_llm_output(raw)

    return FormulaSheetResponse(
        formulas=formulas,
        definitions=definitions,
        subject_id=subject_id,
        chunks_used=chunks_used,
        empty=False,
    )
