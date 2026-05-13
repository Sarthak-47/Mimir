import type { NavView } from "@/App";

const VIEW_TITLES: Record<NavView, { rune: string; title: string; subtitle: string }> = {
  oracle:    { rune: "ᚦ", title: "The Oracle",    subtitle: "Speak, and Mimir shall answer" },
  trials:    { rune: "ᛏ", title: "Trials",         subtitle: "Test your knowledge. Face the trial." },
  reckoning: { rune: "ᚢ", title: "The Reckoning", subtitle: "Behold your progress, warrior" },
  chronicle: { rune: "ᛊ", title: "Chronicle",      subtitle: "Records of past sessions" },
  scrolls:   { rune: "ᚱ", title: "Scrolls",        subtitle: "Your uploaded knowledge" },
};

interface TopbarProps {
  view: NavView;
  isConnected: boolean;
}

export default function Topbar({ view, isConnected }: TopbarProps) {
  const { rune, title, subtitle } = VIEW_TITLES[view];

  return (
    <header style={styles.topbar}>
      <div style={styles.left}>
        <span style={styles.rune}>{rune}</span>
        <div>
          <div style={styles.title}>{title}</div>
          <div style={styles.subtitle}>{subtitle}</div>
        </div>
      </div>

      <div style={styles.right}>
        <div style={{ ...styles.statusDot, background: isConnected ? "var(--green-bright)" : "#8a3a3a" }} />
        <span style={styles.statusText}>
          {isConnected ? "Connected" : "Offline"}
        </span>
      </div>

      {/* Gold engraving bottom border */}
      <div style={styles.engravingBottom} />
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px 0",
    background: "var(--stone-2)",
    borderBottom: "var(--border-green)",
    position: "relative",
    flexShrink: 0,
    paddingBottom: 9,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  rune: {
    fontFamily: "var(--font-header)",
    fontSize: 20,
    color: "var(--gold)",
    lineHeight: 1,
  },
  title: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "var(--text-primary)",
  },
  subtitle: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    fontStyle: "italic",
    color: "var(--text-dim)",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
  },
  statusText: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  engravingBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.3,
  },
};
