import type { NavView } from "@/App";

const VIEW_META: Record<NavView, { rune: string; title: string; subtitle: string }> = {
  oracle:    { rune: "ᚦ", title: "The Oracle",    subtitle: "Speak your question into the well" },
  trials:    { rune: "ᛏ", title: "Trials",         subtitle: "Test your knowledge. Face the trial."  },
  reckoning: { rune: "ᚢ", title: "The Reckoning", subtitle: "Behold your progress, warrior"         },
  chronicle: { rune: "ᛊ", title: "Chronicle",      subtitle: "Records of past sessions"              },
  scrolls:   { rune: "ᚱ", title: "Scrolls",        subtitle: "Your uploaded knowledge"               },
};

const MODEL_NAME = "qwen2.5:14b";

interface TopbarProps {
  view: NavView;
  isConnected: boolean;
  activeSubjectName?: string | null;
}

export default function Topbar({ view, isConnected, activeSubjectName }: TopbarProps) {
  const { title, subtitle } = VIEW_META[view];

  // Breadcrumb: "The Oracle" or "The Oracle · Machine Learning"
  const breadcrumb = activeSubjectName
    ? `${title} · ${activeSubjectName}`
    : title;

  return (
    <header style={styles.topbar}>
      {/* ── Left: breadcrumb + subtitle ── */}
      <div style={styles.left}>
        <div style={styles.breadcrumb}>{breadcrumb}</div>
        <div style={styles.subtitle}>{subtitle}</div>
      </div>

      {/* ── Right: model badge + status pill ── */}
      <div style={styles.right}>
        <div style={styles.modelBadge}>{MODEL_NAME}</div>

        <div style={styles.statusPill}>
          <span
            style={{
              ...styles.statusDot,
              background: isConnected ? "var(--green-bright)" : "#8a3a3a",
              boxShadow: isConnected ? "0 0 4px var(--green-bright)" : "none",
            }}
          />
          <span style={styles.statusText}>
            {isConnected ? "awake" : "offline"}
          </span>
        </div>
      </div>

      {/* Gold engraving bottom line */}
      <div style={styles.bottomLine} />
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 9px",
    background: "var(--stone-2)",
    borderBottom: "1px solid var(--green-dark)",
    position: "relative",
    flexShrink: 0,
  },
  left: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  },
  breadcrumb: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  subtitle: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--text-primary)",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  modelBadge: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    border: "1px solid var(--green-dark)",
    background: "var(--stone-3)",
    padding: "3px 7px",
  },
  statusPill: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid var(--green-dark)",
    background: "var(--stone-3)",
    padding: "3px 8px",
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background 0.3s",
  },
  statusText: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.12em",
    color: "var(--text-secondary)",
    textTransform: "lowercase" as const,
  },
  bottomLine: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.25,
  },
};
