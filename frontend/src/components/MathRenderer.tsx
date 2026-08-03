/**
 * MathRenderer — shared KaTeX + bold renderer used by Chat and Quiz.
 *
 * Supports:
 *   $$...$$ — display math block (centred)
 *   $...$   — inline math
 *   **...**  — bold (gold accent)
 *
 * Local models occasionally emit LaTeX that is subtly malformed — most often a
 * "double superscript", where the symbol that should follow an exponent gets
 * trapped inside its braces (`W^{[l]a}^{[l-1]}` instead of `W^{[l]}a^{[l-1]}`).
 * KaTeX refuses those outright, and the old behaviour was to dump the raw
 * source, dollar signs and all, into the middle of an otherwise clean answer.
 *
 * So rendering now degrades in three stages: repair the known malformations and
 * render strictly; if that still fails let KaTeX render in forgiving mode so the
 * reader gets typeset maths with the bad span highlighted; and only if even that
 * fails show the source — without the delimiters, so it reads as text rather
 * than as broken markup.
 */
import katex from "katex";
import "katex/dist/katex.min.css";

// ── Repair pass ──────────────────────────────────────────────
/**
 * Fix LaTeX malformations that local models produce often enough to matter.
 *
 * Currently handles the trapped-symbol double script in both directions:
 *   `W^{[l]a}^{[l-1]}` → `W^{[l]}a^{[l-1]}`
 *   `x_{i j}_{k}`      → `x_{i }j_{k}`
 * The trailing letter inside the first brace group is the one that belongs
 * outside it, so we lift it out and let the second script attach to it.
 */
export function repairLatex(src: string): string {
  let out = src;
  // A letter trapped at the end of a script's braces, immediately followed by
  // another script of the same kind — the classic double-superscript error.
  out = out.replace(/\^\{([^{}]*?)([A-Za-z])\}\s*\^\{/g, "^{$1}$2^{");
  out = out.replace(/_\{([^{}]*?)([A-Za-z])\}\s*_\{/g, "_{$1}$2_{");
  return out;
}

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
  const blockStyle = display
    ? { display: "block", textAlign: "center" as const, margin: "6px 0" }
    : undefined;

  // 1. Repaired source, strict — the common case and the malformed-but-fixable one.
  try {
    const html = katex.renderToString(repairLatex(latex), {
      displayMode: display,
      throwOnError: true,
    });
    return <span key={keyVal} dangerouslySetInnerHTML={{ __html: html }} style={blockStyle} />;
  } catch { /* fall through */ }

  // 2. Forgiving mode — typeset what parses, flag what does not.
  try {
    const html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      errorColor: "#d4a82c",
    });
    return <span key={keyVal} dangerouslySetInnerHTML={{ __html: html }} style={blockStyle} />;
  } catch { /* fall through */ }

  // 3. Give up, but show it as prose rather than as broken markup.
  return <span key={keyVal} style={blockStyle}>{latex}</span>;
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
 * Malformed formulas are repaired where possible and never shown as raw
 * `$…$` source.
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
