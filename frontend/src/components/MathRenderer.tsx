/**
 * MathRenderer — shared KaTeX + bold renderer used by Chat and Quiz.
 *
 * Supports:
 *   $$...$$ — display math block (centred)
 *   $...$   — inline math
 *   **...**  — bold (gold accent)
 */
import katex from "katex";
import "katex/dist/katex.min.css";

// ── KaTeX atom ───────────────────────────────────────────────
function KatexSpan({
  latex,
  display,
  keyVal,
}: {
  latex:  string;
  display: boolean;
  keyVal: string;
}) {
  try {
    const html = katex.renderToString(latex, { displayMode: display, throwOnError: true });
    return (
      <span
        key={keyVal}
        dangerouslySetInnerHTML={{ __html: html }}
        style={display ? { display: "block", textAlign: "center", margin: "6px 0" } : undefined}
      />
    );
  } catch {
    return <span key={keyVal}>{display ? `$$${latex}$$` : `$${latex}$`}</span>;
  }
}

// ── Bold helper ──────────────────────────────────────────────
function renderBold(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <span key={`${keyPrefix}-b${i}`} style={{ color: "var(--gold-bright)", fontWeight: 600 }}>{part}</span>
      : <span key={`${keyPrefix}-t${i}`}>{part}</span>
  );
}

// ── Main renderer ────────────────────────────────────────────
/**
 * Renders a string that may contain:
 *   - $$…$$ display math blocks
 *   - $…$ inline math
 *   - **bold** text (gold accent)
 *
 * Safe fallback: if KaTeX can't parse a formula, the raw source is shown.
 */
export function MathText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];

  const displayParts = text.split(/\$\$([\s\S]+?)\$\$/g);
  displayParts.forEach((part, di) => {
    if (di % 2 === 1) {
      nodes.push(<KatexSpan key={`d${di}`} latex={part} display={true} keyVal={`d${di}`} />);
    } else {
      const inlineParts = part.split(/\$([^$\n]+?)\$/g);
      inlineParts.forEach((seg, ii) => {
        if (ii % 2 === 1) {
          nodes.push(<KatexSpan key={`d${di}i${ii}`} latex={seg} display={false} keyVal={`d${di}i${ii}`} />);
        } else {
          nodes.push(...renderBold(seg, `d${di}i${ii}`));
        }
      });
    }
  });

  return <>{nodes}</>;
}
