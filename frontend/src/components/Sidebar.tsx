import { useState } from "react";
import type { NavView, Subject } from "@/App";

// ── Nav items ───────────────────────────────────────────────
const NAV_ITEMS: { view: NavView; rune: string; label: string }[] = [
  { view: "oracle",    rune: "ᚦ", label: "The Oracle"    },
  { view: "trials",   rune: "ᛏ", label: "Trials"         },
  { view: "reckoning",rune: "ᚢ", label: "Reckoning"      },
  { view: "chronicle",rune: "ᛊ", label: "Chronicle"      },
  { view: "scrolls",  rune: "ᚱ", label: "Scrolls"        },
];

// ── Props ───────────────────────────────────────────────────
interface SidebarProps {
  view: NavView;
  onViewChange: (v: NavView) => void;
  subjects: Subject[];
  activeSubject: string | null;
  onSubjectChange: (id: string) => void;
  onAddSubject: (name: string) => void;
}

// ── Component ───────────────────────────────────────────────
export default function Sidebar({
  view, onViewChange,
  subjects, activeSubject, onSubjectChange, onAddSubject,
}: SidebarProps) {
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubjectName.trim()) {
      onAddSubject(newSubjectName.trim());
      setNewSubjectName("");
      setAddingSubject(false);
    }
  };

  return (
    <aside style={styles.sidebar}>
      {/* ── Logo ── */}
      <div style={styles.logo}>
        <span style={styles.logoRune}>ᛗ</span>
        <div>
          <div style={styles.logoName}>MIMIR</div>
          <div style={styles.logoSub}>Well of Knowledge</div>
        </div>
      </div>

      <div style={styles.engraving} />

      {/* ── Navigation ── */}
      <nav style={styles.nav}>
        {NAV_ITEMS.map(({ view: v, rune, label }) => (
          <button
            key={v}
            style={{
              ...styles.navItem,
              ...(view === v ? styles.navItemActive : {}),
            }}
            onClick={() => onViewChange(v)}
          >
            <span style={styles.navRune}>{rune}</span>
            <span style={styles.navLabel}>{label}</span>
          </button>
        ))}
      </nav>

      <div style={styles.engraving} />

      {/* ── Subjects / Disciplines ── */}
      <div style={styles.sectionHeader}>DISCIPLINES</div>
      <div style={{ ...styles.subjectList, ...styles.scrollArea }}>
        {subjects.map((s) => (
          <button
            key={s.id}
            style={{
              ...styles.subjectItem,
              ...(activeSubject === s.id ? styles.subjectItemActive : {}),
            }}
            onClick={() => onSubjectChange(s.id)}
          >
            <span
              style={{
                ...styles.diamond,
                background: s.color,
              }}
            />
            <span style={styles.subjectName}>{s.name}</span>
          </button>
        ))}

        {/* Add subject form */}
        {addingSubject ? (
          <form onSubmit={handleAddSubmit} style={{ marginTop: 4 }}>
            <input
              autoFocus
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="Discipline name..."
              style={styles.subjectInput}
              onBlur={() => { setAddingSubject(false); setNewSubjectName(""); }}
            />
          </form>
        ) : (
          <button style={styles.addSubject} onClick={() => setAddingSubject(true)}>
            + engrave new discipline
          </button>
        )}
      </div>

      {/* ── User Profile (bottom) ── */}
      <div style={styles.profile}>
        <div style={styles.engraving} />
        <div style={styles.profileContent}>
          <div style={styles.profileAvatar}>S</div>
          <div>
            <div style={styles.profileName}>Sarthak</div>
            <div style={styles.profileTitle}>Seeker of Wisdom</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: "var(--sidebar-width)",
    minWidth: "var(--sidebar-width)",
    background: "var(--stone-2)",
    borderRight: "var(--border-green)",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 12px 10px",
  },
  logoRune: {
    fontFamily: "var(--font-header)",
    fontSize: 22,
    color: "var(--gold)",
    lineHeight: 1,
  },
  logoName: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.18em",
    color: "var(--text-primary)",
  },
  logoSub: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    color: "var(--text-dim)",
    letterSpacing: "0.08em",
    fontStyle: "italic",
  },
  engraving: {
    height: 1,
    background: "var(--engraving)",
    margin: "4px 0",
    opacity: 0.5,
  },
  nav: {
    padding: "4px 0",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 12px",
    background: "none",
    border: "none",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.15s",
  },
  navItemActive: {
    background: "var(--stone-3)",
    borderLeftColor: "var(--green)",
  },
  navRune: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    color: "var(--green)",
    width: 16,
    textAlign: "center",
    lineHeight: 1,
  },
  navLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-secondary)",
  },
  sectionHeader: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.18em",
    color: "var(--text-dim)",
    padding: "6px 12px 4px",
    textTransform: "uppercase" as const,
  },
  subjectList: {
    flex: 1,
    padding: "0 8px",
    overflowY: "auto" as const,
  },
  scrollArea: {
    overflowY: "auto" as const,
  },
  subjectItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "4px 6px",
    background: "none",
    border: "none",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    textAlign: "left" as const,
  },
  subjectItemActive: {
    background: "var(--stone-3)",
    borderLeftColor: "var(--green-bright)",
  },
  diamond: {
    display: "inline-block",
    width: 6,
    height: 6,
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  subjectName: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subjectInput: {
    width: "100%",
    background: "var(--stone-3)",
    border: "var(--border-green)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 11,
    padding: "4px 6px",
    outline: "none",
  },
  addSubject: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    color: "var(--text-dim)",
    fontStyle: "italic",
    padding: "4px 6px",
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
    marginTop: 4,
  },
  profile: {
    padding: "0 0 8px",
    marginTop: "auto",
  },
  profileContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
  },
  profileAvatar: {
    width: 26,
    height: 26,
    background: "var(--green-dark)",
    border: "var(--border-green)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--green-bright)",
    flexShrink: 0,
  },
  profileName: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "var(--text-primary)",
  },
  profileTitle: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    fontStyle: "italic",
    color: "var(--text-dim)",
  },
};
