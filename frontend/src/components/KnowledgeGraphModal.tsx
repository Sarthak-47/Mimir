/**
 * KnowledgeGraphModal — prerequisite knowledge graph for a subject.
 *
 * Node sizes are computed dynamically from label text so nothing clips.
 * viewBox is derived from the actual bounding-box of the laid-out nodes.
 */
import { useState, useEffect, useMemo } from "react";
import { API_GRAPH } from "@/config";

interface GraphNode { id: number; name: string; subject_id: number; confidence_score: number }
interface GraphEdge { source: number; target: number; label: string }
interface GraphData  { nodes: GraphNode[]; edges: GraphEdge[] }

interface KnowledgeGraphModalProps {
  authToken:   string;
  subjectId:   string | null;
  subjectName: string | null;
  onClose:     () => void;
}

type Phase = "loading" | "result" | "empty" | "error";

// ── Font / geometry constants ────────────────────────────────
// Cinzel is an all-caps display serif — chars are roughly 0.64 × fontSize wide
const GFONT   = 8.0;   // node label font-size (px)
const CW      = 0.64;  // Cinzel char-width factor
const LH      = 1.40;  // line-height factor

// ── Text helpers ─────────────────────────────────────────────
function wrapWords(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

/** Minimum circle radius that fully contains the wrapped label. */
function nodeR(name: string): number {
  const lines   = wrapWords(name, 14);
  const longest = Math.max(...lines.map(l => l.length));
  const hw = (longest * GFONT * CW) / 2;          // half text-box width
  const hh = (lines.length * GFONT * LH) / 2;     // half text-box height
  // radius must contain the text-box diagonally + padding
  return Math.ceil(Math.max(28, Math.sqrt(hw * hw + hh * hh) + 10));
}

// ── Force-directed layout (radius-aware) ─────────────────────
interface LayoutNode extends GraphNode { x: number; y: number; vx: number; vy: number }

const VW = 860, VH = 620;   // working canvas — nodes are clamped inside this

function runLayout(nodes: GraphNode[], edges: GraphEdge[], radii: number[]): LayoutNode[] {
  const n = nodes.length;
  if (!n) return [];

  const avgR   = radii.reduce((a, b) => a + b, 0) / n;
  const K_REP  = 4000 + avgR * 160;          // stronger repulsion for larger nodes
  const IDEAL  = 100 + avgR * 2.0;           // longer ideal spring

  const laid: LayoutNode[] = nodes.map((nd, i) => ({
    ...nd,
    x: VW / 2 + Math.cos((2 * Math.PI * i) / n) * 210,
    y: VH / 2 + Math.sin((2 * Math.PI * i) / n) * 210,
    vx: 0, vy: 0,
  }));

  const byId: Record<number, number> = {};
  laid.forEach((nd, i) => { byId[nd.id] = i; });

  for (let iter = 0; iter < 160; iter++) {
    // Repulsion + soft collision between every pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx   = (laid[j].x - laid[i].x) || 0.01;
        const dy   = (laid[j].y - laid[i].y) || 0.01;
        const d2   = dx * dx + dy * dy;
        const dist = Math.sqrt(d2) + 0.01;
        const minD = radii[i] + radii[j] + 12;     // minimum gap between circles
        // collision push (hard) or normal repulsion (soft)
        const f = dist < minD
          ? (minD - dist) * 0.55
          : K_REP / d2;
        laid[i].vx -= f * dx / dist;  laid[i].vy -= f * dy / dist;
        laid[j].vx += f * dx / dist;  laid[j].vy += f * dy / dist;
      }
    }
    // Spring attraction along edges
    for (const e of edges) {
      const ai = byId[e.source], bi = byId[e.target];
      if (ai == null || bi == null) continue;
      const dx   = laid[bi].x - laid[ai].x;
      const dy   = laid[bi].y - laid[ai].y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f    = (dist - IDEAL) * 0.035;
      laid[ai].vx += f * dx / dist;  laid[ai].vy += f * dy / dist;
      laid[bi].vx -= f * dx / dist;  laid[bi].vy -= f * dy / dist;
    }
    // Centre gravity
    for (const nd of laid) {
      nd.vx += (VW / 2 - nd.x) * 0.0025;
      nd.vy += (VH / 2 - nd.y) * 0.0025;
    }
    // Integrate + damp + clamp to per-node radius
    for (let i = 0; i < n; i++) {
      const r = radii[i] + 8;
      laid[i].x = Math.max(r, Math.min(VW - r, laid[i].x + laid[i].vx * 0.45));
      laid[i].y = Math.max(r, Math.min(VH - r, laid[i].y + laid[i].vy * 0.45));
      laid[i].vx *= 0.75;
      laid[i].vy *= 0.75;
    }
  }
  return laid;
}

// ── Colour helpers ───────────────────────────────────────────
function confColor(s: number): string {
  if (s >= 75) return "#6ab87a";
  if (s >= 50) return "#c9a84c";
  if (s >= 25) return "#d4934a";
  return "#c87a7a";
}

function ArrowDefs() {
  const COLS = ["#6ab87a", "#c9a84c", "#d4934a", "#c87a7a"];
  return (
    <defs>
      {COLS.map(col => (
        <marker key={col}
          id={`arr-${col.slice(1)}`}
          markerWidth="8" markerHeight="8"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill={col} opacity="0.65" />
        </marker>
      ))}
    </defs>
  );
}

// ── Loading / error spinner ──────────────────────────────────
function Spin({ text, red }: { text: string; red?: boolean }) {
  const c = red ? "#c87a7a" : "var(--text-dim)";
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, padding: "48px 0" }}>
      <div style={{ fontFamily: "var(--font-header)", fontSize: 36, color: red ? "#c87a7a" : "var(--gold-dim)" }}>ᚷ</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: c, textAlign: "center" as const, maxWidth: 340 }}>{text}</div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function KnowledgeGraphModal({
  authToken, subjectId, subjectName, onClose,
}: KnowledgeGraphModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [raw,   setRaw]   = useState<GraphData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = subjectId ? `${API_GRAPH}/?subject_id=${subjectId}` : `${API_GRAPH}/`;
    fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({})) as { detail?: string };
          throw new Error(b.detail ?? `Error ${r.status}`);
        }
        return r.json() as Promise<GraphData>;
      })
      .then(d => { setRaw(d); setPhase(d.nodes.length < 2 ? "empty" : "result"); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Unknown error"); setPhase("error"); });
  }, [authToken, subjectId]);

  // Compute per-node radii + run layout
  const { laid, radii } = useMemo(() => {
    if (!raw || raw.nodes.length < 2) return { laid: [] as LayoutNode[], radii: [] as number[] };
    const rs = raw.nodes.map(nd => nodeR(nd.name));
    return { laid: runLayout(raw.nodes, raw.edges, rs), radii: rs };
  }, [raw]);

  const idxById = useMemo(() => {
    const m: Record<number, number> = {};
    laid.forEach((nd, i) => { m[nd.id] = i; });
    return m;
  }, [laid]);

  // Auto viewBox — derived from actual node positions + radii
  const vb = useMemo(() => {
    if (!laid.length) return { x: 0, y: 0, w: VW, h: VH };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    laid.forEach((nd, i) => {
      const r = radii[i];
      x0 = Math.min(x0, nd.x - r);
      y0 = Math.min(y0, nd.y - r);
      x1 = Math.max(x1, nd.x + r);
      y1 = Math.max(y1, nd.y + r + 16);   // +16 for the % label below the circle
    });
    const P = 22;
    return { x: x0 - P, y: y0 - P, w: x1 - x0 + P * 2, h: y1 - y0 + P * 2 };
  }, [laid, radii]);

  const title = subjectName ? `${subjectName} — Knowledge Graph` : "Knowledge Graph";

  return (
    <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.rune}>ᚷ</span>
          <span style={S.htitle}>{title}</span>
          <button style={S.close} onClick={onClose}>×</button>
        </div>
        <div style={S.line} />

        {/* Body */}
        <div style={S.body}>
          {phase === "loading" && <Spin text="Mapping prerequisite connections…" />}
          {phase === "error"   && <Spin text={error} red />}
          {phase === "empty"   && <Spin text="Not enough topics tracked yet. Study more topics in this subject to build the graph." />}

          {phase === "result" && raw && laid.length > 0 && (
            <>
              {/* Legend */}
              <div style={S.legend}>
                {(["#6ab87a","#c9a84c","#d4934a","#c87a7a"] as string[]).map((c, i) => (
                  <div key={c} style={S.lItem}>
                    <div style={{ ...S.lDot, background: c }} />
                    <span style={S.lLabel}>{["≥ 75 %","50–74 %","25–49 %","< 25 %"][i]}</span>
                  </div>
                ))}
                <span style={S.lCaption}>→ prerequisite of</span>
              </div>

              {/* Graph */}
              <svg
                viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
                style={{ display: "block", width: "100%", height: "auto" }}
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Background */}
                <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#0d1117" />
                <ArrowDefs />

                {/* Edges */}
                {raw.edges.map((e, ei) => {
                  const ai = idxById[e.source], bi = idxById[e.target];
                  if (ai == null || bi == null) return null;
                  const a = laid[ai], b = laid[bi];
                  const dx = b.x - a.x, dy = b.y - a.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const tr  = radii[bi] + 3;             // stop arrow at circle edge
                  const col = confColor(b.confidence_score);
                  return (
                    <line key={ei}
                      x1={a.x} y1={a.y}
                      x2={b.x - (dx / dist) * tr}
                      y2={b.y - (dy / dist) * tr}
                      stroke={col} strokeWidth="1.2" strokeOpacity="0.4"
                      markerEnd={`url(#arr-${col.slice(1)})`}
                    />
                  );
                })}

                {/* Nodes */}
                {laid.map((nd, ni) => {
                  const r      = radii[ni];
                  const col    = confColor(nd.confidence_score);
                  const lines  = wrapWords(nd.name, 14);
                  const lineH  = GFONT * LH;
                  const totalH = lines.length * lineH;
                  return (
                    <g key={nd.id}>
                      {/* Circle */}
                      <circle cx={nd.x} cy={nd.y} r={r}
                        fill="#1c2a1c" stroke={col} strokeWidth="1.8" />
                      {/* Label lines — vertically centred inside circle */}
                      {lines.map((ln, li) => (
                        <text key={li}
                          x={nd.x}
                          y={nd.y - totalH / 2 + (li + 0.5) * lineH}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={col}
                          fontSize={GFONT}
                          fontFamily="Cinzel, serif"
                        >{ln}</text>
                      ))}
                      {/* Confidence % below circle */}
                      <text
                        x={nd.x} y={nd.y + r + 10}
                        textAnchor="middle"
                        fill="#4a6a4a"
                        fontSize="7"
                        fontFamily="'Crimson Text', serif"
                      >{nd.confidence_score.toFixed(0)} %</text>
                    </g>
                  );
                })}
              </svg>

              {raw.edges.length === 0 && (
                <p style={S.noEdge}>No prerequisite links found — topics appear largely independent.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={S.line} />
        <div style={S.footer}>
          <span style={S.fhint}>
            {phase === "result" ? "Graph regenerates from your latest topic data each time." : ""}
          </span>
          <button style={S.fcBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  panel:    { width: 720, maxWidth: "96vw", maxHeight: "92vh", background: "var(--stone-2)", border: "1px solid var(--gold-dim)", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  header:   { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--stone-3)", flexShrink: 0 },
  rune:     { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold-bright)", lineHeight: 1 },
  htitle:   { fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  close:    { background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 18, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 },
  line:     { height: 1, background: "linear-gradient(90deg,transparent,var(--gold-dim) 40%,var(--gold-dim) 60%,transparent)", opacity: 0.4, flexShrink: 0 },
  body:     { flex: 1, overflow: "auto", padding: "12px 16px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 },
  legend:   { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const, width: "100%" },
  lItem:    { display: "flex", alignItems: "center", gap: 5 },
  lDot:     { width: 10, height: 10, borderRadius: "50%" },
  lLabel:   { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)" },
  lCaption: { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.1em", color: "var(--text-dim)", marginLeft: "auto" },
  noEdge:   { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", textAlign: "center" as const, paddingTop: 8 },
  footer:   { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 16px", flexShrink: 0 },
  fhint:    { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", flex: 1 },
  fcBtn:    { background: "none", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
};
