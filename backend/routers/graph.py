"""
Mimir — Knowledge Graph Router.

GET /api/graph?subject_id={id}

Returns the topics for a subject as graph nodes (with confidence scores)
and LLM-inferred prerequisite edges between them.  The graph is stateless —
regenerated on each request from live topic data.
"""

import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from memory.database import Subject, Topic, User, get_db
from agent.tools import _llm
from routers.users import get_current_user

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────

class GraphNode(BaseModel):
    id:               int
    name:             str
    subject_id:       int
    confidence_score: float   # 0–100


class GraphEdge(BaseModel):
    source: int    # topic id
    target: int    # topic id
    label:  str    # short reason, e.g. "required for"


class GraphResponse(BaseModel):
    nodes:      list[GraphNode]
    edges:      list[GraphEdge]
    subject_id: int | None


# ── Endpoint ─────────────────────────────────────────────────

@router.get("/", response_model=GraphResponse)
async def get_knowledge_graph(
    subject_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build a prerequisite knowledge graph for the user's topics in a subject.

    1. Loads all topics for the subject.
    2. Asks the LLM to infer prerequisite edges between them.
    3. Returns nodes (topics + confidence) and edges (prerequisites).

    Returns an empty graph if fewer than 2 topics are tracked.
    No LLM call is made in that case.
    """
    user_id = current_user.id

    # Load topics
    topic_q = select(Topic).where(Topic.user_id == user_id)
    if subject_id:
        topic_q = topic_q.where(Topic.subject_id == subject_id)
    topics_result = await db.execute(topic_q)
    topics = topics_result.scalars().all()

    nodes = [
        GraphNode(
            id=t.id,
            name=t.name,
            subject_id=t.subject_id,
            confidence_score=t.confidence_score,
        )
        for t in topics
    ]

    if len(nodes) < 2:
        return GraphResponse(nodes=nodes, edges=[], subject_id=subject_id)

    # Build name → id map
    name_to_id = {t.name: t.id for t in topics}

    # Get subject name for context
    subject_name = ""
    if subject_id:
        sub_res = await db.execute(
            select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
        )
        sub = sub_res.scalar_one_or_none()
        if sub:
            subject_name = sub.name

    topic_names = [t.name for t in topics]
    subject_hint = f" ({subject_name})" if subject_name else ""

    prompt = (
        f"These are topics a student is studying{subject_hint}:\n"
        + "\n".join(f"- {n}" for n in topic_names)
        + "\n\n"
        "Identify prerequisite relationships: pairs where understanding topic A is "
        "necessary before effectively studying topic B.\n\n"
        "Return a JSON object (no markdown, no preamble):\n"
        '{ "edges": [ { "from": "<exact topic name>", "to": "<exact topic name>", "label": "<3-5 word reason>" } ] }\n\n'
        "Rules:\n"
        "- Only use topic names exactly as listed above.\n"
        "- Include only genuine foundational prerequisites (A must come before B).\n"
        "- Aim for 3–12 edges. Return an empty list if topics are independent.\n"
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
        if m:
            try:
                data = json.loads(m.group())
            except json.JSONDecodeError:
                pass

    edges: list[GraphEdge] = []
    seen: set[tuple[int, int]] = set()
    for e in data.get("edges", []):
        if not isinstance(e, dict):
            continue
        src_name = str(e.get("from", "")).strip()
        tgt_name = str(e.get("to",   "")).strip()
        label    = str(e.get("label", "prerequisite")).strip()
        src_id = name_to_id.get(src_name)
        tgt_id = name_to_id.get(tgt_name)
        if src_id and tgt_id and src_id != tgt_id:
            key = (src_id, tgt_id)
            if key not in seen:
                seen.add(key)
                edges.append(GraphEdge(source=src_id, target=tgt_id, label=label))

    return GraphResponse(nodes=nodes, edges=edges, subject_id=subject_id)
