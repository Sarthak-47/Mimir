/**
 * MindMapModal — radial SVG mind map for any topic.
 *
 * Calls POST /api/mindmap/generate, then renders the returned two-level tree
 * as a radial SVG.  Supports downloading the map as an SVG file.
 *
 * Triggered by the MAP button in InputZone.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { API_MINDMAP } from "@/config";

interface MindMapLeaf   { label: string }
interface MindMapBranch { label: string; children: MindMapLeaf[] }
interface MindMapData   { center: string; branches: MindMapBranch[] }

interface MindMapModalProps {
  authToken: string;
  topic:     string;
  subject:   string;
  onClose:   () => void;
}

// ── Branch palette (cycles for > 6 branches) ─────────────────
const BRANCH_COLORS = [
  "#6ab87a", "#c9a84c", "#7aaa84", "#d4934a",
  "#5a9a6a", "#b89a3c", "#4a8a5a", "#c87a7a",
];

type Phase = "loading" | "result" | "error";

// ── SVG layout constants ─────────────────────────────────────
const CX = 280, CY = 220;   // canvas centre
const R_BRANCH = 145;        // centre → branch node
const R_LEAF   = 90;         // branch → leaf node (relative)
const W = 560, H = 440;

interface Point { x: number; y: number }

function radialPoint(cx: number, cy: number, angle: number, r: number): Point {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 2);
}

// ── Radial SVG renderer ──────────────────────────────────────
function MindMapSVG({ data, svgRef }: { data: MindMapData; svgRef: React.RefObject<SVGSVGElement | null> }) {
  const N = data.branches.length;

  return (
    <svg
      ref={svgRef as React.RefObject<SVGSVGElement>}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", maxWidth: "100%" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={W} height={H} fill="#0d1117" />

      {data.branches.map((branch, bi) => {
        const color      = BRANCH_COLORS[bi % BRANCH_COLORS.length];
        const bAngle     = (bi / N) * 2 * Math.PI - Math.PI / 2;
        const bPos       = radialPoint(CX, CY, bAngle, R_BRANCH);
        const M          = branch.children.length;
        const spread     = Math.min(0.5, 0.8 / Math.max(M, 1));

        return (
          <g key={bi}>
            {/* Centre → branch line */}
            <line
              x1={CX} y1={CY} x2={bPos.x} y2={bPos.y}
              stroke={color} strokeWidth="1.5" strokeOpacity="0.6"
            />

            {/* Branch node */}
            <circle cx={bPos.x} cy={bPos.y} r={22} fill="#1c2a1c" stroke={color} strokeWidth="1.5" />
            {wrapText(branch.label, 10).map((line, li, arr) => (
              <text
                key={li}
                x={bPos.x} y={bPos.y + (li - (arr.length - 1) / 2) * 10}
                textAnchor="middle" dominantBaseline="middle"
                fill={color} fontSize="8.5" fontFamily="Cinzel, serif"
              >{line}</text>
            ))}

            {/* Leaf nodes */}
            {branch.children.map((leaf, li) => {
              const lAngle = bAngle + spread * (li - (M - 1) / 2);
              const lPos   = radialPoint(bPos.x, bPos.y, lAngle, R_LEAF);
              return (
                <g key={li}>
                  <line
                    x1={bPos.x} y1={bPos.y} x2={lPos.x} y2={lPos.y}
                    stroke={color} strokeWidth="1" strokeOpacity="0.4"
                  />
                  <rect
                    x={lPos.x - 32} y={lPos.y - 13}
                    width={64} height={26}
                    rx={4} ry={4}
                    fill="#0d1117" stroke={color} strokeWidth="1" strokeOpacity="0.5"
                  />
                  {wrapText(leaf.label, 9).map((line, ti, arr) => (
                    <text
                      key={ti}
                      x={lPos.x} y={lPos.y + (ti - (arr.length - 1) / 2) * 9}
                      textAnchor="middle" dominantBaseline="middle"
                      fill="#a0b8a0" fontSize="7.5" fontFamily="'Crimson Text', serif"
                    >{line}</text>
                  ))}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Centre node (drawn last so it sits on top) */}
      <circle cx={CX} cy={CY} r={36} fill="#1c2a1c" stroke="#c9a84c" strokeWidth="2" />
      {wrapText(data.center, 11).map((line, i, arr) => (
        <text
          key={i}
          x={CX} y={CY + (i - (arr.length - 1) / 2) * 11}
          textAnchor="middle" dominantBaseline="middle"
          fill="#c9a84c" fontSize="10" fontWeight="700" fontFamily="Cinzel, serif"
        >{line}</text>
      ))}
    </svg>
  );
}

// ── Modal ────────────────────────────────────────────────────
export default function MindMapModal({ authToken, topic, subject, onClose }: MindMapModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data,  setData]  = useState<MindMapData | null>(null);
  const [error, setError] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    fetch(`${API_MINDMAP}/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ topic, subject }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(b.detail ?? `Error ${res.status}`);
        }
        return res.json() as Promise<MindMapData>;
      })
      .then((d) => { setData(d); setPhase("result"); })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error");
        setPhase("error");
      });
  }, [authToken, topic, subject]);

  const handleDownload = useCallback(() => {
    if (!svgRef.current) return;
    const xml    = new XMLSerializer().serializeToString(svgRef.current);
    const blob   = new Blob([xml], { type: "image/svg+xml" });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement("a");
    a.href       = url;
    a.download   = `${topic.replace(/\s+/g, "_")}_mindmap.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topic]);

  return (
    <div
      style={S.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.headerRune}>ᚷ</span>
          <span style={S.headerTitle}>Mind Map — {topic}</span>
          {subject && <span style={S.subjectBadge}>{subject}</span>}
          <button style={S.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={S.engraving} />

        {/* Body */}
        <div style={S.body}>
          {phase === "loading" && (
            <div style={S.spinner}>
              <div style={S.spinnerRune}>ᚷ</div>
              <div style={S.spinnerText}>Weaving the mind map…</div>
            </div>
          )}
          {phase === "error" && (
            <div style={S.spinner}>
              <div style={{ ...S.spinnerRune, color: "#c87a7a" }}>ᚷ</div>
              <div style={{ ...S.spinnerText, color: "#c87a7a" }}>{error}</div>
            </div>
          )}
          {phase === "result" && data && (
            <div style={S.svgWrap}>
              <MindMapSVG data={data} svgRef={svgRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.engraving} />
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Close</button>
          {phase === "result" && (
            <button style={S.downloadBtn} onClick={handleDownload}>
              ↓ Download SVG
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop:    { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  panel:       { width: 620, maxWidth: "96vw", maxHeight: "92vh", background: "var(--stone-2)", border: "1px solid var(--gold-dim)", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  header:      { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--stone-3)", flexShrink: 0 },
  headerRune:  { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold-bright)", lineHeight: 1 },
  headerTitle: { fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  subjectBadge:{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-dim)", background: "var(--stone-4)", padding: "2px 7px", border: "1px solid var(--green-dark)", flexShrink: 0 },
  closeBtn:    { background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 18, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 },
  engraving:   { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)", opacity: 0.4, flexShrink: 0 },
  body:        { flex: 1, overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "12px" },
  svgWrap:     { width: "100%", display: "flex", justifyContent: "center" },
  spinner:     { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, padding: "48px 0" },
  spinnerRune: { fontFamily: "var(--font-header)", fontSize: 36, color: "var(--gold-dim)" },
  spinnerText: { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)" },
  footer:      { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "10px 16px", flexShrink: 0 },
  cancelBtn:   { background: "none", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
  downloadBtn: { background: "var(--stone-3)", border: "1px solid var(--gold-dim)", color: "var(--gold-bright)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
};
