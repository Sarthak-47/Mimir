/**
 * Diagram.tsx — renders a Mermaid diagram produced by the agent's `diagram` tool.
 *
 * Before this existed the model answered "I cannot draw an image directly" when
 * a student asked to see something. Now the agent returns Mermaid source and
 * this component turns it into an actual picture inside the chat bubble.
 *
 * Mermaid is loaded lazily on first use — it is a large dependency and most
 * conversations never ask for a diagram, so it should not sit in the initial
 * bundle. Rendering is wrapped so a syntax slip from the model degrades into the
 * diagram source rather than blanking the message.
 */
import { useEffect, useRef, useState } from "react";

interface DiagramProps {
  /** Mermaid source, e.g. "graph LR\n  a-->b". */
  code: string;
  /** Set when the tool could not produce a diagram at all. */
  error?: string;
}

// One shared init across the app; mermaid complains if configured twice.
let mermaidReady: Promise<typeof import("mermaid").default> | null = null;

function getMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "'Crimson Text', Georgia, serif",
        // Hand-tuned to the app palette rather than a stock theme, so diagrams
        // look drawn for Mimir instead of pasted in from elsewhere.
        theme: "base",
        themeVariables: {
          background:          "#0d1510",
          primaryColor:        "#111d14",
          primaryTextColor:    "#ccecd4",
          primaryBorderColor:  "#329944",
          secondaryColor:      "#172418",
          tertiaryColor:       "#0d2814",
          lineColor:           "#9a7830",
          textColor:           "#ccecd4",
          mainBkg:             "#111d14",
          nodeBorder:          "#329944",
          clusterBkg:          "#0d1510",
          clusterBorder:       "#9a7830",
          titleColor:          "#d4a82c",
          edgeLabelBackground: "#0d1510",
          fontSize:            "15px",
        },
      });
      return mermaid;
    });
  }
  return mermaidReady;
}

let idCounter = 0;

export default function Diagram({ code, error }: DiagramProps) {
  const [svg,     setSvg]     = useState<string>("");
  const [failed,  setFailed]  = useState(false);
  const idRef = useRef(`mimir-diagram-${++idCounter}`);

  useEffect(() => {
    let cancelled = false;
    if (!code?.trim()) return;

    (async () => {
      try {
        const mermaid = await getMermaid();
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled) { setSvg(svg); setFailed(false); }
      } catch {
        // Model produced something Mermaid will not parse — show the source
        // rather than an empty bubble.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return <div style={styles.note}>{error}</div>;
  }

  if (failed) {
    return (
      <div style={styles.wrap}>
        <div style={styles.label}>ᚹ Diagram source</div>
        <pre style={styles.pre}>{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return <div style={styles.note}>Drawing…</div>;
  }

  return (
    <figure style={styles.wrap}>
      <div style={styles.label}>ᚹ Diagram</div>
      <div style={styles.canvas} dangerouslySetInnerHTML={{ __html: svg }} />
    </figure>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    margin: "12px 0 4px",
    padding: "10px 12px 12px",
    background: "var(--stone-2)",
    border: "1px solid var(--green-dark)",
    position: "relative",
  },
  label: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
    marginBottom: 8,
  },
  // Wide diagrams scroll inside their own box instead of stretching the bubble.
  canvas: {
    overflowX: "auto",
    textAlign: "center" as const,
  },
  pre: {
    margin: 0,
    padding: "8px 10px",
    background: "var(--stone-0)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-secondary)",
    fontSize: 12,
    lineHeight: 1.6,
    overflowX: "auto",
    whiteSpace: "pre" as const,
  },
  note: {
    margin: "10px 0 4px",
    fontStyle: "italic",
    color: "var(--text-dim)",
    fontSize: 14,
  },
};
