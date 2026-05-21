"""
Mimir — Mind Map Router.

POST /api/mindmap/generate

Asks the local LLM to generate a hierarchical mind-map structure for any
topic.  Returns a JSON tree that the frontend renders as a radial SVG map.
"""

import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from memory.database import User
from agent.tools import _llm
from routers.users import get_current_user

router = APIRouter()

_MAX_BRANCHES = 6
_MAX_CHILDREN = 5


# ── Schemas ──────────────────────────────────────────────────

class MindMapRequest(BaseModel):
    topic:   str
    subject: str = ""


class MindMapLeaf(BaseModel):
    label: str


class MindMapBranch(BaseModel):
    label:    str
    children: list[MindMapLeaf] = []


class MindMapResponse(BaseModel):
    center:   str
    branches: list[MindMapBranch]


# ── Endpoint ─────────────────────────────────────────────────

@router.post("/generate", response_model=MindMapResponse)
async def generate_mind_map(
    req: MindMapRequest,
    _: User = Depends(get_current_user),
):
    """Generate a hierarchical mind-map structure for a topic.

    The LLM produces a two-level tree: up to 6 branch nodes, each with up
    to 5 leaf children.  Returns 503 if Ollama is unavailable.
    """
    subject_hint = f" in the context of {req.subject}" if req.subject else ""
    prompt = (
        f'Create a structured mind map for the topic "{req.topic}"{subject_hint}.\n\n'
        "Return a JSON object (no markdown, no preamble):\n"
        "{\n"
        '  "center": "<topic name>",\n'
        '  "branches": [\n'
        '    { "label": "<branch name>", "children": [{ "label": "<leaf>" }, ...] },\n'
        "    ...\n"
        "  ]\n"
        "}\n\n"
        f"Rules:\n"
        f"- Include 3 to {_MAX_BRANCHES} branches.\n"
        f"- Each branch should have 2 to {_MAX_CHILDREN} children.\n"
        "- Keep labels concise (3–6 words max).\n"
        "- Cover the most important sub-topics, key concepts, formulas, and applications.\n"
        "- Return plain JSON only."
    )

    try:
        raw = await asyncio.to_thread(_llm, prompt)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {exc}") from exc

    stripped = raw.strip()
    data: dict = {}
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", stripped, re.DOTALL)
        if not m:
            raise HTTPException(status_code=503, detail="Model returned unparseable output")
        data = json.loads(m.group())

    center   = str(data.get("center", req.topic)).strip()
    branches: list[MindMapBranch] = []

    for b in data.get("branches", [])[:_MAX_BRANCHES]:
        if not isinstance(b, dict):
            continue
        label    = str(b.get("label", "")).strip()
        children = [
            MindMapLeaf(label=str(c.get("label", "")).strip())
            for c in b.get("children", [])[:_MAX_CHILDREN]
            if isinstance(c, dict) and c.get("label")
        ]
        if label:
            branches.append(MindMapBranch(label=label, children=children))

    if not branches:
        raise HTTPException(status_code=503, detail="Model returned no mind-map branches")

    return MindMapResponse(center=center, branches=branches)
