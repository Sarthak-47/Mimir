import type { NavView } from "@/App";

const VIEW_META: Record<NavView, { rune: string; title: string; subtitle: string }> = {
  oracle:    { rune: "ᚦ", title: "The Oracle",    subtitle: "Speak your question into the well" },
  trials:    { rune: "ᛏ", title: "Trials",         subtitle: "Test your knowledge. Face the trial."  },
  reckoning: { rune: "ᚢ", title: "The Reckoning", subtitle: "Behold your progress, warrior"         },
  chronicle: { rune: "ᛊ", title: "Chronicle",      subtitle: "Records of past sessions"              },
  scrolls:   { rune: "ᚱ", title: "Scrolls",        subtitle: "Your uploaded knowledge"               },
};

interface TopbarProps {
  view: NavView;
  isConnected: boolean;
  activeSubjectName?: string | null;
  username?: string;
  onLogout?: () => void;
}

/**
 * Top navigation bar showing the current view title and connection status.
 *
 * Renders a breadcrumb (`"The Oracle"` or `"The Oracle · Machine Learning"`),
 * a subtitle, the signed-in username with a logout rune button, and a live
 * WebSocket status pill (green = connected, red = offline).
 *
 * @param view               - Current active view for title/subtitle lookup.
 * @param isConnected        - WebSocket connection state from `useWebSocket`.
 * @param activeSubjectName  - Optional subject name appended to the breadcrumb.
 * @param username           - Display name shown in the user badge.
 * @param onLogout           - Called when the user clicks the logout rune.
 */
export default function Topbar({ view, isConnected, activeSubjectName, username, onLogout }: TopbarProps) {
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

      {/* ── Right: username + model badge + status pill ── */}
      <div style={styles.right}>
        {username && (
          <div style={styles.userRow}>
            <span style={styles.userName}>{username}</span>
            {onLogout && (
              <button style={styles.logoutBtn} onClick={onLogout} title="Leave the Well">
                ᛚ
              </button>
            )}
          </div>
        )}

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
    fontSize: 11,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  subtitle: {
    fontFamily: "var(--font-header)",
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: "var(--text-primary)",
  },
  right: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  userRow: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid var(--green-dark)",
    background: "var(--stone-3)",
    padding: "3px 8px",
  },
  userName: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.1em",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
  },
  logoutBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 13,
    cursor: "pointer",
    padding: "0 0 0 4px",
    lineHeight: 1,
    transition: "color 0.15s",
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
    fontSize: 11,
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
