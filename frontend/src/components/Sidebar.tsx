import { useState } from "react";
import type { NavView, Subject } from "@/App";

// ── Nav items ───────────────────────────────────────────────
const NAV_ITEMS: { view: NavView; rune: string; label: string }[] = [
  { view: "oracle",     rune: "ᚦ", label: "The Oracle"   },
  { view: "trials",    rune: "ᛏ", label: "Trials"        },
  { view: "reckoning", rune: "ᚢ", label: "The Reckoning" },
  { view: "chronicle", rune: "ᛊ", label: "Chronicle"     },
  { view: "scrolls",   rune: "ᚱ", label: "Scrolls"       },
];

/** SVG eye-in-diamond logo mark rendered in gold. */
function LogoMark() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M18 2 L34 18 L18 34 L2 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <line x1="18" y1="2"  x2="18" y2="6"  stroke="#c9a84c" strokeWidth="1" />
      <line x1="34" y1="18" x2="30" y2="18" stroke="#c9a84c" strokeWidth="1" />
      <line x1="18" y1="34" x2="18" y2="30" stroke="#c9a84c" strokeWidth="1" />
      <line x1="2"  y1="18" x2="6"  y2="18" stroke="#c9a84c" strokeWidth="1" />
      <path d="M10 18 Q18 11 26 18 Q18 25 10 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <circle cx="18" cy="18" r="3.5" stroke="#c9a84c" strokeWidth="1" fill="none" />
      <circle cx="18" cy="18" r="1.5" fill="#c9a84c" />
    </svg>
  );
}

// ── Props ───────────────────────────────────────────────────
interface SidebarProps {
  view: NavView;
  onViewChange:    (v: NavView) => void;
  subjects:        Subject[];
  activeSubject:   string | null;
  onSubjectChange: (id: string) => void;
  onAddSubject:    (name: string) => void;
  onDeleteSubject: (id: string) => void;
  username:        string;
  examDate:        Date | null;
  onSetExamDate:   (d: Date | null) => void;
}

/**
 * Left navigation sidebar.
 *
 * Contains the logo, five navigation buttons (view switcher), a list of study
 * disciplines with add/delete, an exam date picker (labelled "Ragnarök"), and
 * the user profile strip at the bottom.
 *
 * @param view             - Currently active view name.
 * @param onViewChange     - Called when the user clicks a nav button.
 * @param subjects         - List of study disciplines owned by the user.
 * @param activeSubject    - ID of the currently selected discipline, or null.
 * @param onSubjectChange  - Called with the new subject ID on selection.
 * @param onAddSubject     - Called with the name string when a discipline is added.
 * @param onDeleteSubject  - Called with the ID when a discipline is removed.
 * @param username         - Display name for the profile strip.
 * @param examDate         - Optional exam deadline shown as the Ragnarök date.
 * @param onSetExamDate    - Called with a Date or null when the date is edited.
 */
export default function Sidebar({
  view, onViewChange,
  subjects, activeSubject, onSubjectChange, onAddSubject, onDeleteSubject,
  username, examDate, onSetExamDate,
}: SidebarProps) {
  const [addingSubject, setAddingSubject]   = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [hoveredSubject, setHoveredSubject] = useState<string | null>(null);
  const [editingExamDate, setEditingExamDate] = useState(false);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSubjectName.trim()) {
      onAddSubject(newSubjectName.trim());
      setNewSubjectName("");
      setAddingSubject(false);
    }
  };

  const handleExamDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onSetExamDate(val ? new Date(val + "T00:00:00") : null);
    setEditingExamDate(false);
  };

  // Format exam date for display
  const examDateStr = examDate
    ? examDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : null;

  // Format for date input value (YYYY-MM-DD)
  const examDateInputVal = examDate
    ? examDate.toISOString().split("T")[0]
    : "";

  // Avatar initial from username
  const avatarChar = username ? username[0].toUpperCase() : "?";

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
            style={{ ...styles.navItem, ...(view === v ? styles.navItemActive : {}) }}
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
          <div
            key={s.id}
            style={styles.subjectRow}
            onMouseEnter={() => setHoveredSubject(s.id)}
            onMouseLeave={() => setHoveredSubject(null)}
          >
            <button
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
            {hoveredSubject === s.id && (
              <button
                style={styles.deleteBtn}
                title="Remove discipline"
                onClick={(e) => { e.stopPropagation(); onDeleteSubject(s.id); }}
              >
                ×
              </button>
            )}
          </div>
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

      {/* ── Exam Date ── */}
      <div style={styles.examSection}>
        <div style={styles.engraving} />
        <div style={styles.examRow}>
          <span style={styles.examLabel}>Ragnarök</span>
          {editingExamDate ? (
            <input
              type="date"
              autoFocus
              defaultValue={examDateInputVal}
              onChange={handleExamDateChange}
              onBlur={() => setEditingExamDate(false)}
              style={styles.examInput}
            />
          ) : (
            <button style={styles.examValue} onClick={() => setEditingExamDate(true)}>
              {examDateStr ?? "set date"}
            </button>
          )}
        </div>
      </div>

      {/* ── User Profile ── */}
      <div style={styles.profile}>
        <div style={styles.engraving} />
        <div style={styles.profileContent}>
          <div style={styles.profileAvatar}>{avatarChar}</div>
          <div>
            <div style={styles.profileName}>{username || "Seeker"}</div>
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
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.2em",
    color: "var(--gold-bright)",
  },
  logoSub: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
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
    fontSize: 10,
    letterSpacing: "0.2em",
    textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
    padding: "6px 12px 3px",
  },
  nav: { padding: "2px 0" },
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
    fontSize: 16,
    color: "var(--green-dim)",
    width: 18,
    textAlign: "center" as const,
    lineHeight: 1,
    flexShrink: 0,
  },
  navRuneActive: { color: "var(--green-bright)" },
  navLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  navLabelActive: { color: "var(--text-primary)" },
  subjectList: {
    flex: 1,
    padding: "0 8px",
    overflowY: "auto" as const,
  },
  subjectRow: {
    display: "flex",
    alignItems: "center",
    position: "relative" as const,
  },
  subjectItem: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flex: 1,
    padding: "5px 6px",
    background: "none",
    border: "none",
    borderLeft: "2px solid transparent",
    cursor: "pointer",
    textAlign: "left" as const,
    transition: "all 0.12s",
  },
  subjectItemActive: { borderLeftColor: "var(--green-bright)" },
  diamond: {
    display: "inline-block",
    width: 6,
    height: 6,
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  subjectName: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--text-dim)",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  subjectNameActive: { color: "var(--text-primary)" },
  deleteBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontSize: 13,
    lineHeight: 1,
    cursor: "pointer",
    padding: "2px 4px",
    flexShrink: 0,
    transition: "color 0.1s",
  },
  subjectInput: {
    width: "100%",
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "4px 6px",
    outline: "none",
  },
  addSubject: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
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
  examSection: {
    padding: "0 8px 4px",
  },
  examRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 4px",
  },
  examLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.16em",
    color: "var(--gold-dim)",
    textTransform: "uppercase" as const,
  },
  examValue: {
    background: "none",
    border: "none",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    color: "var(--text-dim)",
    fontStyle: "italic",
    cursor: "pointer",
    padding: 0,
    textDecoration: "underline",
    textDecorationStyle: "dotted" as const,
    textDecorationColor: "var(--green-dark)",
  },
  examInput: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    padding: "2px 4px",
    outline: "none",
    width: 110,
  },
  profile: {
    padding: "0 0 8px",
  },
  profileContent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
  },
  profileAvatar: {
    width: 30,
    height: 30,
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-header)",
    fontSize: 13,
    fontWeight: 700,
    color: "var(--gold)",
    flexShrink: 0,
  },
  profileName: {
    fontFamily: "var(--font-header)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.1em",
    color: "var(--text-primary)",
  },
  profileTitle: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
    marginTop: 1,
  },
};
