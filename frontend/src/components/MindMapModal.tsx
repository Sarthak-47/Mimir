/**
 * MindMapModal — radial SVG mind map for any topic.
 *
 * Node circles and leaf rects are sized dynamically from their text so labels
 * never clip.  The SVG viewBox is derived from the actual element bounding box.
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

type Phase = "loading" | "result" | "error";

// ── Branch palette (cycles for > 6 branches) ─────────────────
const BRANCH_COLORS = [
  "#6ab87a", "#c9a84c", "#7aaa84", "#d4934a",
  "#5a9a6a", "#b89a3c", "#4a8a5a", "#c87a7a",
];

// ── Font / geometry constants ────────────────────────────────
// Cinzel (branch + centre labels)
const CINZEL_CW = 0.64;   // char-width factor
// Crimson Text (leaf labels)
const CRIMSON_CW = 0.58;
const LH = 1.40;           // line-height factor

const BRANCH_FONT  = 8.5;
const CENTER_FONT  = 10;
const LEAF_FONT    = 7.5;

const R_BRANCH = 168;   // centre → branch node centre (px)
const R_LEAF   = 118;   // branch node centre → leaf centre (px)

// ── Text helpers ─────────────────────────────────────────────
function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
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

/**
 * Minimum circle radius that fully encloses the wrapped text block.
 * Uses the diagonal of the text bounding-box so all four corners sit inside.
 */
function circleR(
  text: string,
  fontSize: number,
  maxChars: number,
  minR: number,
  cwFactor = CINZEL_CW,
): number {
  const lines   = wrapText(text, maxChars);
  const longest = Math.max(...lines.map(l => l.length));
  const hw = (longest * fontSize * cwFactor) / 2;   // half text-box width
  const hh = (lines.length * fontSize * LH) / 2;    // half text-box height
  return Math.ceil(Math.max(minR, Math.sqrt(hw * hw + hh * hh) + 10));
}

/** Width × height for a leaf rounded-rect, sized to fit its wrapped label. */
function leafDims(text: string): { w: number; h: number; lines: string[] } {
  const lines   = wrapText(text, 14, 2);
  const longest = Math.max(...lines.map(l => l.length));
  const tw = longest * LEAF_FONT * CRIMSON_CW;
  const th = lines.length * LEAF_FONT * LH;
  return {
    w:     Math.max(58, Math.ceil(tw + 18)),
    h:     Math.max(22, Math.ceil(th + 10)),
    lines,
  };
}

interface Point { x: number; y: number }

function radialPoint(cx: number, cy: number, angle: number, r: number): Point {
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

// ── Radial SVG renderer ──────────────────────────────────────
function MindMapSVG({
  data,
  svgRef,
}: {
  data:   MindMapData;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const N = data.branches.length;

  // Pre-compute centre radius
  const cR = circleR(data.center, CENTER_FONT, 16, 38);

  // ── Compute all positions (centre at origin) ─────────────
  type LeafItem  = { lPos: Point; dims: ReturnType<typeof leafDims> };
  type BranchItem = {
    bi:     number;
    color:  string;
    bAngle: number;
    bPos:   Point;
    bR:     number;
    bLines: string[];
    leaves: LeafItem[];
  };

  const items: BranchItem[] = data.branches.map((branch, bi) => {
    const color  = BRANCH_COLORS[bi % BRANCH_COLORS.length];
    const bAngle = (bi / N) * 2 * Math.PI - Math.PI / 2;
    const bPos   = radialPoint(0, 0, bAngle, R_BRANCH);
    const bR     = circleR(branch.label, BRANCH_FONT, 13, 24);
    const bLines = wrapText(branch.label, 13);
    const M      = branch.children.length;
    const spread = Math.min(0.52, 0.85 / Math.max(M, 1));

    const leaves: LeafItem[] = branch.children.map((leaf, li) => {
      const lAngle = bAngle + spread * (li - (M - 1) / 2);
      const lPos   = radialPoint(bPos.x, bPos.y, lAngle, R_LEAF);
      return { lPos, dims: leafDims(leaf.label) };
    });

    return { bi, color, bAngle, bPos, bR, bLines, leaves };
  });

  // ── Auto viewBox from bounding box ───────────────────────
  let x0 = -cR, y0 = -cR, x1 = cR, y1 = cR;
  for (const { bPos, bR, leaves } of items) {
    x0 = Math.min(x0, bPos.x - bR);   y0 = Math.min(y0, bPos.y - bR);
    x1 = Math.max(x1, bPos.x + bR);   y1 = Math.max(y1, bPos.y + bR);
    for (const { lPos, dims } of leaves) {
      x0 = Math.min(x0, lPos.x - dims.w / 2);   y0 = Math.min(y0, lPos.y - dims.h / 2);
      x1 = Math.max(x1, lPos.x + dims.w / 2);   y1 = Math.max(y1, lPos.y + dims.h / 2);
    }
  }
  const PAD = 20;
  const VX = x0 - PAD, VY = y0 - PAD;
  const VW = x1 - x0 + PAD * 2, VH = y1 - y0 + PAD * 2;

  const bLineH = BRANCH_FONT * LH;
  const lLineH = LEAF_FONT   * LH;
  const cLineH = CENTER_FONT * LH;

  return (
    <svg
      ref={svgRef as React.RefObject<SVGSVGElement>}
      viewBox={`${VX} ${VY} ${VW} ${VH}`}
      style={{ display: "block", width: "100%", height: "100%", maxHeight: "calc(92vh - 130px)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background fills the whole viewBox */}
      <rect x={VX} y={VY} width={VW} height={VH} fill="#0d1117" />

      {items.map(({ bi, color, bPos, bR, bLines, leaves }) => {
        const bTotalH = bLines.length * bLineH;
        return (
          <g key={bi}>
            {/* Centre → branch spine */}
            <line
              x1={0} y1={0} x2={bPos.x} y2={bPos.y}
              stroke={color} strokeWidth="1.5" strokeOpacity="0.6"
            />

            {/* Leaf connectors (drawn before rects so rects cover line ends) */}
            {leaves.map(({ lPos }, li) => (
              <line key={`l-${li}`}
                x1={bPos.x} y1={bPos.y} x2={lPos.x} y2={lPos.y}
                stroke={color} strokeWidth="1" strokeOpacity="0.4"
              />
            ))}

            {/* Leaf rects + labels */}
            {leaves.map(({ lPos, dims }, li) => {
              const totalLH = dims.lines.length * lLineH;
              return (
                <g key={`lr-${li}`}>
                  <rect
                    x={lPos.x - dims.w / 2} y={lPos.y - dims.h / 2}
                    width={dims.w} height={dims.h}
                    rx={4} ry={4}
                    fill="#0d1117" stroke={color} strokeWidth="1" strokeOpacity="0.55"
                  />
                  {dims.lines.map((ln, ti) => (
                    <text key={ti}
                      x={lPos.x}
                      y={lPos.y - totalLH / 2 + (ti + 0.5) * lLineH}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#a0b8a0"
                      fontSize={LEAF_FONT}
                      fontFamily="'Crimson Text', serif"
                    >{ln}</text>
                  ))}
                </g>
              );
            })}

            {/* Branch circle + label (drawn on top of spine + connectors) */}
            <circle cx={bPos.x} cy={bPos.y} r={bR}
              fill="#1c2a1c" stroke={color} strokeWidth="1.5" />
            {bLines.map((ln, li) => (
              <text key={li}
                x={bPos.x}
                y={bPos.y - bTotalH / 2 + (li + 0.5) * bLineH}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={color}
                fontSize={BRANCH_FONT}
                fontFamily="Cinzel, serif"
              >{ln}</text>
            ))}
          </g>
        );
      })}

      {/* Centre node — drawn last so it sits on top of all spines */}
      <circle cx={0} cy={0} r={cR} fill="#1c2a1c" stroke="#c9a84c" strokeWidth="2" />
      {(() => {
        const cLines  = wrapText(data.center, 16);
        const totalCH = cLines.length * cLineH;
        return cLines.map((ln, i) => (
          <text key={i}
            x={0}
            y={-totalCH / 2 + (i + 0.5) * cLineH}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#c9a84c"
            fontSize={CENTER_FONT}
            fontWeight="700"
            fontFamily="Cinzel, serif"
          >{ln}</text>
        ));
      })()}
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
      .then(async res => {
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { detail?: string };
          throw new Error(b.detail ?? `Error ${res.status}`);
        }
        return res.json() as Promise<MindMapData>;
      })
      .then(d => { setData(d); setPhase("result"); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Unknown error"); setPhase("error"); });
  }, [authToken, topic, subject]);

  const handleDownload = useCallback(() => {
    if (!svgRef.current) return;
    const xml  = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `${topic.replace(/\s+/g, "_")}_mindmap.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [topic]);

  return (
    <div
      style={S.backdrop}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.panel}>
        {/* Header */}
        <div style={S.header}>
          <span style={S.rune}>ᚷ</span>
          <span style={S.htitle}>Mind Map — {topic}</span>
          {subject && <span style={S.badge}>{subject}</span>}
          <button style={S.close} onClick={onClose}>×</button>
        </div>
        <div style={S.line} />

        {/* Body */}
        <div style={S.body}>
          {phase === "loading" && (
            <div style={S.spin}>
              <div style={S.spinRune}>ᚷ</div>
              <div style={S.spinText}>Weaving the mind map…</div>
            </div>
          )}
          {phase === "error" && (
            <div style={S.spin}>
              <div style={{ ...S.spinRune, color: "#c87a7a" }}>ᚷ</div>
              <div style={{ ...S.spinText, color: "#c87a7a" }}>{error}</div>
            </div>
          )}
          {phase === "result" && data && (
            <div style={S.svgWrap}>
              <MindMapSVG data={data} svgRef={svgRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={S.line} />
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Close</button>
          {phase === "result" && (
            <button style={S.dlBtn} onClick={handleDownload}>↓ Download SVG</button>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop:  { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 },
  panel:     { width: 660, maxWidth: "96vw", maxHeight: "92vh", background: "var(--stone-2)", border: "1px solid var(--gold-dim)", display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  header:    { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "var(--stone-3)", flexShrink: 0 },
  rune:      { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold-bright)", lineHeight: 1 },
  htitle:    { fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  badge:     { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-dim)", background: "var(--stone-4)", padding: "2px 7px", border: "1px solid var(--green-dark)", flexShrink: 0 },
  close:     { background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 18, cursor: "pointer", padding: "0 0 0 8px", lineHeight: 1, flexShrink: 0 },
  line:      { height: 1, background: "linear-gradient(90deg,transparent,var(--gold-dim) 40%,var(--gold-dim) 60%,transparent)", opacity: 0.4, flexShrink: 0 },
  body:      { flex: 1, minHeight: 0, overflow: "hidden", display: "flex", alignItems: "stretch", padding: "12px" },
  svgWrap:   { flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  spin:      { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, padding: "48px 0" },
  spinRune:  { fontFamily: "var(--font-header)", fontSize: 36, color: "var(--gold-dim)" },
  spinText:  { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)" },
  footer:    { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, padding: "10px 16px", flexShrink: 0 },
  cancelBtn: { background: "none", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
  dlBtn:     { background: "var(--stone-3)", border: "1px solid var(--gold-dim)", color: "var(--gold-bright)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", cursor: "pointer", padding: "6px 14px", textTransform: "uppercase" as const },
};
