/**
 * KnowledgeGraphModal — prerequisite knowledge graph for a subject.
 *
 * Calls GET /api/graph?subject_id={id}, then runs a simple force-directed
 * layout and renders the graph as an SVG.  Nodes are coloured by confidence.
 *
 * Triggered by the GRAPH button in the Reckoning view.
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

const W = 580, H = 440;

// ── Force-directed layout ────────────────────────────────────
interface LayoutNode extends GraphNode { x: number; y: number; vx: number; vy: number }

function runLayout(nodes: GraphNode[], edges: GraphEdge[]): LayoutNode[] {
  const n = nodes.length;
  const laid: LayoutNode[] = nodes.map((nd, i) => ({
    ...nd,
    x: W / 2 + Math.cos((2 * Math.PI * i) / n) * 160,
    y: H / 2 + Math.sin((2 * Math.PI * i) / n) * 160,
    vx: 0,
    vy: 0,
  }));

  const idxById: Record<number, number> = {};
  laid.forEach((nd, i) => { idxById[nd.id] = i; });

  for (let iter = 0; iter < 120; iter++) {
    // Repulsion between every pair
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = laid[j].x - laid[i].x || 0.01;
        const dy = laid[j].y - laid[i].y || 0.01;
        const d2   = dx * dx + dy * dy;
        const dist = Math.sqrt(d2) + 0.01;
        const f    = 4000 / d2;
        laid[i].vx -= f * dx / dist;
        laid[i].vy -= f * dy / dist;
        laid[j].vx += f * dx / dist;
        laid[j].vy += f * dy / dist;
      }
    }
    // Spring attraction along edges
    for (const e of edges) {
      const ai = idxById[e.source];
      const bi = idxById[e.target];
      if (ai == null || bi == null) continue;
      const dx   = laid[bi].x - laid[ai].x;
      const dy   = laid[bi].y - laid[ai].y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const ideal = 130;
      const f    = (dist - ideal) * 0.04;
      laid[ai].vx += f * dx / dist;
      laid[ai].vy += f * dy / dist;
      laid[bi].vx -= f * dx / dist;
      laid[bi].vy -= f * dy / dist;
    }
    // Centre attraction so the graph doesn't drift off-screen
    for (const nd of laid) {
      nd.vx += (W / 2 - nd.x) * 0.003;
      nd.vy += (H / 2 - nd.y) * 0.003;
    }
    // Integrate + damp + clamp
    for (const nd of laid) {
      nd.x = Math.max(52, Math.min(W - 52, nd.x + nd.vx * 0.45));
      nd.y = Math.max(30, Math.min(H - 30, nd.y + nd.vy * 0.45));
      nd.vx *= 0.75;
      nd.vy *= 0.75;
    }
  }
  return laid;
}

function confidenceColor(score: number): string {
  if (score >= 75) return "#6ab87a";
  if (score >= 50) return "#c9a84c";
  if (score >= 25) return "#d4934a";
  return "#c87a7a";
}

// ── Arrow marker defs ────────────────────────────────────────
function ArrowDefs() {
  return (
    <defs>
      {["#6ab87a", "#c9a84c", "#d4934a", "#c87a7a"].map((col) => (
        <marker
          key={col}
          id={`arrow-${col.replace("#", "")}`}
          markerWidth="8" markerHeight="8"
          refX="7" refY="3"
          orient="auto"
        >
          <path d="M0,0 L0,6 L8,3 z" fill={col} opacity="0.6" />
        </marker>
      ))}
    </defs>
  );
}

// ── Main modal ───────────────────────────────────────────────
export default function KnowledgeGraphModal({
  authToken, subjectId, subjectName, onClose,
}: KnowledgeGraphModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [raw,   setRaw]   = useState<GraphData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = subjectId
      ? `${API_GRAPH}/?subject_id=${subjectId}`
      : `${API_GRAPH}/`;

    fetch(url, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(b.detail ?? `Error ${res.status}`);
        }
        return res.json() as Promise<GraphData>;
      })
      .then((d) => {
        setRaw(d);
        setPhase(d.nodes.length < 2 ? "empty" : "result");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error");
        setPhase("error");
      });
  }, [authToken, subjectId]);

  // Run layout only when raw data arrives
  const laid = useMemo(
    () => (raw && raw.nodes.length >= 2 ? runLayout(raw.nodes, raw.edges) : []),
    [raw],
  );

  const idxById = useMemo(() => {
    const m: Record<number, number> = {};
    laid.forEach((nd, i) => { m[nd.id] = i; });
    return m;
  }, [laid]);

  const title = subjectName ? `${subjectName} — Knowledge Graph` : "Knowledge Graph";

  return (
    <div
      style={S.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.headerRune}>ᚷ</span>
          <span style={S.headerTitle}>{title}</span>
          <button style={S.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={S.engraving} />

        {/* Body */}
        <div style={S.body}>

          {phase === "loading" && (
            <div style={S.spinner}>
              <div style={S.spinnerRune}>ᚷ</div>
              <div style={S.spinnerText}>Mapping prerequisite connections…</div>
            </div>
          )}

          {phase === "error" && (
            <div style={S.spinner}>
              <div style={{ ...S.spinnerRune, color: "#c87a7a" }}>ᚷ</div>
              <div style={{ ...S.spinnerText, color: "#c87a7a" }}>{error}</div>
            </div>
          )}

          {phase === "empty" && (
            <div style={S.spinner}>
              <div style={S.spinnerRune}>ᚷ</div>
              <div style={S.spinnerText}>
                Not enough topics tracked yet.
              </div>
              <div style={{ ...S.spinnerText, marginTop: 4 }}>
                Study more topics in this subject to build the graph.
              </div>
            </div>
          )}

          {phase === "result" && raw && laid.length > 0 && (
            <>
              {/* Legend */}
              <div style={S.legend}>
                {[["#6ab87a", "≥75%"], ["#c9a84c", "50–74%"], ["#d4934a", "25–49%"], ["#c87a7a", "<25%"]].map(([c, l]) => (
                  <div key={c} style={S.legendItem}>
                    <div style={{ ...S.legendDot, background: c }} />
                    <span style={S.legendLabel}>{l}</span>
                  </div>
                ))}
                <span style={S.legendCaption}>→ prerequisite of</span>
              </div>

              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", maxWidth: "100%" }}>
                <rect width={W} height={H} fill="#0d1117" />
                <ArrowDefs />

                {/* Edges */}
                {raw.edges.map((e, i) => {
                  const ai = idxById[e.source];
                  const bi = idxById[e.target];
                  if (ai == null || bi == null) return null;
                  const a = laid[ai], b = laid[bi];
                  // Offset end point so arrow tip doesn't overlap the target circle
                  const dx = b.x - a.x, dy = b.y - a.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const r = 22;
                  const ex = b.x - (dx / dist) * r;
                  const ey = b.y - (dy / dist) * r;
                  const col = confidenceColor(b.confidence_score);
                  const arrowId = `arrow-${col.replace("#", "")}`;
                  return (
                    <g key={i}>
                      <line
                        x1={a.x} y1={a.y} x2={ex} y2={ey}
                        stroke={col} strokeWidth="1.2" strokeOpacity="0.4"
                        markerEnd={`url(#${arrowId})`}
                      />
                    </g>
                  );
                })}

                {/* Nodes */}
                {laid.map((nd) => {
                  const col   = confidenceColor(nd.confidence_score);
                  const words = nd.name.split(" ");
                  const lines: string[] = [];
                  let cur = "";
                  for (const w of words) {
                    if ((cur + " " + w).trim().length > 12) {
                      if (cur) lines.push(cur); cur = w;
                    } else { cur = (cur + " " + w).trim(); }
                  }
                  if (cur) lines.push(cur);
                  const display = lines.slice(0, 2);
                  return (
                    <g key={nd.id}>
                      <circle cx={nd.x} cy={nd.y} r={22} fill="#1c2a1c" stroke={col} strokeWidth="1.8" />
                      {display.map((l, li) => (
                        <text
                          key={li}
                          x={nd.x}
                          y={nd.y + (li - (display.length - 1) / 2) * 9.5}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={col}
                          fontSize="7.5"
                          fontFamily="Cinzel, serif"
                        >{l}</text>
                      ))}
                      <text
                        x={nd.x} y={nd.y + 28}
                        textAnchor="middle"
                        fill="#4a6a4a"
                        fontSize="7"
                        fontFamily="'Crimson Text', serif"
                      >{nd.confidence_score.toFixed(0)}%</text>
                    </g>
                  );
                })}
              </svg>

              {raw.edges.length === 0 && (
                <div style={S.noEdges}>
                  No prerequisite links found — topics appear largely independent.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={S.engraving} />
        <div style={S.footer}>
          <span style={S.footerHint}>
            {phase === "result" ? "Graph regenerates from your latest topic data each time." : ""}
          </span>
          <button style={S.closeFooterBtn} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop:      { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  panel:         { width: 640, maxWidth: "96vw", maxHeight: "92vh", background: "var(--stone-2)", border: "1px solid var(--gold-dim)", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  header:        { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--stone-3)", flexShrink: 0 },
  headerRune:    { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold-bright)", lineHeight: 1 },
  headerTitle:   { fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  closeBtn:      { background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 18, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 },
  engraving:     { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)", opacity: 0.4, flexShrink: 0 },
  body:          { flex: 1, overflow: "auto", padding: "12px 16px", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 8 },
  spinner:       { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, padding: "48px 0" },
  spinnerRune:   { fontFamily: "var(--font-header)", fontSize: 36, color: "var(--gold-dim)" },
  spinnerText:   { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", textAlign: "center" as const },
  legend:        { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const, width: "100%" },
  legendItem:    { display: "flex", alignItems: "center", gap: 5 },
  legendDot:     { width: 10, height: 10, borderRadius: "50%" },
  legendLabel:   { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)" },
  legendCaption: { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.1em", color: "var(--text-dim)", marginLeft: "auto" },
  noEdges:       { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", textAlign: "center" as const, paddingTop: 8 },
  footer:        { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 16px", flexShrink: 0 },
  footerHint:    { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", flex: 1 },
  closeFooterBtn:{ background: "none", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
};
