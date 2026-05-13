import { useState } from "react";
import type { NavView, Subject } from "@/App";

// ── Nav items ───────────────────────────────────────────────
const NAV_ITEMS: { view: NavView; rune: string; label: string }[] = [
  { view: "oracle",     rune: "ᚦ", label: "The Oracle"    },
  { view: "trials",    rune: "ᛏ", label: "Trials"         },
  { view: "reckoning", rune: "ᚢ", label: "The Reckoning"  },
  { view: "chronicle", rune: "ᛊ", label: "Chronicle"      },
  { view: "scrolls",   rune: "ᚱ", label: "Scrolls"        },
];

// ── Logo mark — eye inside a diamond ────────────────────────
function LogoMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {/* Outer diamond */}
      <path d="M18 2 L34 18 L18 34 L2 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      {/* Corner tick marks */}
      <line x1="18" y1="2"  x2="18" y2="6"  stroke="#c9a84c" strokeWidth="1" />
      <line x1="34" y1="18" x2="30" y2="18" stroke="#c9a84c" strokeWidth="1" />
      <line x1="18" y1="34" x2="18" y2="30" stroke="#c9a84c" strokeWidth="1" />
      <line x1="2"  y1="18" x2="6"  y2="18" stroke="#c9a84c" strokeWidth="1" />
      {/* Eye outline — almond shape */}
      <path d="M10 18 Q18 11 26 18 Q18 25 10 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      {/* Iris */}
      <circle cx="18" cy="18" r="3.5" stroke="#c9a84c" strokeWidth="1" fill="none" />
      {/* Pupil */}
      <circle cx="18" cy="18" r="1.5" fill="#c9a84c" />
    </svg>
  );
}

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
  const [addingSubject, setAddingSubject]   = useState(false);
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
        <LogoMark />
        <div style={{ minWidth: 0 }}>
          <div style={styles.logoName}>MIMIR</div>
          <div style={styles.logoSub}>Drink from the well of knowledge</div>
        </div>
      </div>

      <div style={styles.engraving} />

      {/* ── Navigation Paths ── */}
      <div style={styles.sectionLabel}>Paths</div>
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
            <span style={{ ...styles.navRune, ...(view === v ? styles.navRuneActive : {}) }}>
              {rune}
            </span>
            <span style={{ ...styles.navLabel, ...(view === v ? styles.navLabelActive : {}) }}>
              {label}
            </span>
          </button>
        ))}
      </nav>

      <div style={styles.engraving} />

      {/* ── Disciplines ── */}
      <div style={styles.sectionLabel}>Disciplines</div>
      <div style={styles.subjectList}>
        {subjects.map((s) => (
          <button
            key={s.id}
            style={{
              ...styles.subjectItem,
              ...(activeSubject === s.id ? styles.subjectItemActive : {}),
            }}
            onClick={() => onSubjectChange(s.id)}
          >
            <span style={{ ...styles.diamond, background: s.color }} />
            <span style={{
              ...styles.subjectName,
              ...(activeSubject === s.id ? styles.subjectNameActive : {}),
            }}>
              {s.name}
            </span>
          </button>
        ))}

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

      {/* ── User Profile ── */}
      <div style={styles.profile}>
        <div style={styles.engraving} />
        <div style={styles.profileContent}>
          <div style={styles.profileAvatar}>S</div>
          <div>
            <div style={styles.profileName}>Sarthak</div>
            <div style={styles.profileTitle}>Seeker of wisdom</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Styles ───────────────────────────────────────────────────
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
    gap: 10,
    padding: "12px 12px 10px",
  },
  logoName: {
    fontFamily: "var(--font-header)",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "0.2em",
    color: "var(--gold-bright)",
  },
  logoSub: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    color: "var(--text-dim)",
    fontStyle: "italic",
    lineHeight: 1.3,
    marginTop: 1,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4,
    margin: "2px 0",
  },
  sectionLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
    padding: "6px 12px 3px",
  },
  nav: {
    padding: "2px 0",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    width: "100%",
    padding: "7px 12px",
    background: "none",
    border: "none",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.12s",
  },
  navItemActive: {
    background: "var(--stone-4)",
    borderLeftColor: "var(--green-bright)",
  },
  navRune: {
    fontFamily: "var(--font-header)",
    fontSize: 14,
    color: "var(--green-dim)",
    width: 16,
    textAlign: "center" as const,
    lineHeight: 1,
    flexShrink: 0,
  },
  navRuneActive: {
    color: "var(--green-bright)",
  },
  navLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  navLabelActive: {
    color: "var(--text-primary)",
  },
  subjectList: {
    flex: 1,
    padding: "0 8px",
    overflowY: "auto" as const,
  },
  subjectItem: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    width: "100%",
    padding: "5px 6px",
    background: "none",
    border: "none",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.12s",
  },
  subjectItemActive: {
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
    color: "var(--text-dim)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subjectNameActive: {
    color: "var(--text-primary)",
  },
  subjectInput: {
    width: "100%",
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
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
    padding: "5px 6px",
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left" as const,
    marginTop: 2,
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
    width: 28,
    height: 28,
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-header)",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--gold)",
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
    marginTop: 1,
  },
};
