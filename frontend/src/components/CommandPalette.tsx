/**
 * Mimir — Command Palette (Ctrl+K / Cmd+K)
 *
 * A keyboard-driven command interface. Opens on Ctrl+K, filters commands as
 * the user types, and executes on Enter or click. Supports navigation commands
 * (switch view), chat commands (send a message), and subject-specific shortcuts.
 *
 * Fuzzy matching: a command matches if every character of the query appears in
 * order in the command label/description (standard fuzzy filter).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { NavView, Subject } from "@/App";

interface Command {
  id:          string;
  rune:        string;
  label:       string;
  description: string;
  action:      () => void;
}

interface CommandPaletteProps {
  onSend:         (text: string) => void;
  onViewChange:   (view: NavView) => void;
  subjects:       Subject[];
  activeSubject:  string | null;
}

/** Simple subsequence fuzzy match — every char of `query` appears in `target` in order. */
function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette({
  onSend, onViewChange, subjects, activeSubject,
}: CommandPaletteProps) {
  const [open,    setOpen]    = useState(false);
  const [query,   setQuery]   = useState("");
  const [focused, setFocused] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(""); setFocused(0); }, []);

  // ── Global Ctrl+K / Cmd+K listener ─────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setFocused(0);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // ── Build command list ──────────────────────────────────
  const activeSubjectObj = subjects.find((s) => s.id === activeSubject);
  const subjectName = activeSubjectObj?.name ?? "current topic";

  const COMMANDS: Command[] = [
    // ── Navigation ──
    { id: "nav-oracle",    rune: "ᛟ", label: "Open Oracle",        description: "Go to the chat view",              action: () => { onViewChange("oracle");    close(); } },
    { id: "nav-trials",    rune: "ᛏ", label: "Open Trials",         description: "Go to the quiz view",              action: () => { onViewChange("trials");    close(); } },
    { id: "nav-reckoning", rune: "ᚱ", label: "Open Reckoning",      description: "Go to the progress dashboard",     action: () => { onViewChange("reckoning"); close(); } },
    { id: "nav-chronicle", rune: "ᚲ", label: "Open Chronicle",      description: "Go to the chat history",           action: () => { onViewChange("chronicle"); close(); } },
    { id: "nav-scrolls",   rune: "ᛋ", label: "Open Scrolls",        description: "Go to the uploaded files view",    action: () => { onViewChange("scrolls");   close(); } },

    // ── Chat shortcuts ──
    { id: "chat-quiz",     rune: "ᛏ", label: `Quiz me on ${subjectName}`,         description: "Generate a quiz for the active subject",      action: () => { onSend(`Quiz me on ${subjectName}`);                                    close(); } },
    { id: "chat-flash",    rune: "ᚠ", label: `Flashcards for ${subjectName}`,      description: "Generate flashcards for the active subject",  action: () => { onSend(`Generate flashcards for ${subjectName}`);                       close(); } },
    { id: "chat-schedule", rune: "ᚾ", label: "Build revision schedule",            description: "Create a study plan for upcoming exam",        action: () => { onSend("Build me a revision schedule for my subjects");                 close(); } },
    { id: "chat-weak",     rune: "ᛜ", label: "Show weak topics",                   description: "Identify the areas I need to focus on",        action: () => { onSend("What are my weakest topics and what should I focus on?");      close(); } },
    { id: "chat-study",    rune: "ᛞ", label: "What should I study today?",         description: "Get a personalised study recommendation",      action: () => { onSend("What should I study today based on my progress?");             close(); } },
    { id: "chat-summarise",rune: "ᛝ", label: "Summarise my notes",                 description: "Summarise the most recently uploaded file",    action: () => { onSend("Summarise my uploaded notes");                                  close(); } },
    { id: "chat-explain",  rune: "ᛟ", label: `Explain ${subjectName}`,             description: "Get a deep explanation of the active subject", action: () => { onSend(`Explain the key concepts in ${subjectName}`);                  close(); } },
    { id: "chat-mistakes", rune: "ᚦ", label: "Common mistakes to avoid",           description: "Exam pitfalls for the active subject",         action: () => { onSend(`What are the most common mistakes students make in ${subjectName}?`); close(); } },

    // ── Subject-specific (dynamic) ──
    ...subjects.map((s) => ({
      id:          `subj-${s.id}`,
      rune:        "◆",
      label:       `Switch to ${s.name}`,
      description: `Set ${s.name} as the active subject`,
      action:      () => close(),   // switching subject requires sidebar; just close for now
    })),
  ];

  const filtered = COMMANDS.filter(
    (c) => fuzzyMatch(query, c.label) || fuzzyMatch(query, c.description)
  );

  // ── Keyboard navigation ─────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused((f) => Math.min(f + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused((f) => Math.max(f - 1, 0)); }
    if (e.key === "Enter" && filtered[focused]) { filtered[focused].action(); }
    if (e.key === "Escape") close();
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={close} />

      {/* Palette modal */}
      <div style={styles.palette}>
        {/* Search input */}
        <div style={styles.searchRow}>
          <span style={styles.searchRune}>ᚦ</span>
          <input
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search commands..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setFocused(0); }}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            spellCheck={false}
          />
          <span style={styles.kbdHint}>ESC</span>
        </div>

        <div style={styles.divider} />

        {/* Command list */}
        <div style={styles.list}>
          {filtered.length === 0 ? (
            <div style={styles.empty}>No commands match "{query}"</div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                style={{
                  ...styles.item,
                  ...(i === focused ? styles.itemFocused : {}),
                }}
                onMouseEnter={() => setFocused(i)}
                onClick={cmd.action}
              >
                <span style={styles.itemRune}>{cmd.rune}</span>
                <span style={styles.itemText}>
                  <span style={styles.itemLabel}>{cmd.label}</span>
                  <span style={styles.itemDesc}>{cmd.description}</span>
                </span>
                {i === focused && <span style={styles.itemEnter}>↵</span>}
              </button>
            ))
          )}
        </div>

        <div style={styles.footer}>
          <span style={styles.footerText}>↑↓ navigate · ↵ execute · Ctrl+K toggle</span>
        </div>
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(10,12,10,0.55)",
    zIndex: 900,
    backdropFilter: "blur(2px)",
  },
  palette: {
    position: "fixed",
    top: "18%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "min(600px, 92vw)",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    boxShadow: "0 8px 40px rgba(0,0,0,0.55)",
    zIndex: 901,
    display: "flex",
    flexDirection: "column",
    maxHeight: "62vh",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
  },
  searchRune: {
    fontFamily: "var(--font-header)",
    fontSize: 18,
    color: "var(--gold-dim)",
    flexShrink: 0,
    lineHeight: 1,
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    color: "var(--text-primary)",
    caretColor: "var(--gold)",
  },
  kbdHint: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    padding: "2px 5px",
    border: "1px solid var(--stone-4)",
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: "var(--green-dark)",
    marginBottom: 4,
  },
  list: {
    overflowY: "auto",
    flex: 1,
    padding: "4px 0",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "7px 14px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    transition: "background 0.08s",
  },
  itemFocused: {
    background: "var(--stone-3)",
    borderLeft: "2px solid var(--green)",
  },
  itemRune: {
    fontFamily: "var(--font-header)",
    fontSize: 16,
    color: "var(--green-dim)",
    width: 20,
    flexShrink: 0,
    lineHeight: 1,
    textAlign: "center",
  },
  itemText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  },
  itemLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 12,
    letterSpacing: "0.06em",
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  itemDesc: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  itemEnter: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--gold-dim)",
    flexShrink: 0,
  },
  empty: {
    padding: "14px 14px",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--text-dim)",
  },
  footer: {
    borderTop: "1px solid var(--stone-3)",
    padding: "5px 14px",
  },
  footerText: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    fontStyle: "italic",
    color: "var(--text-dim)",
    letterSpacing: "0.05em",
  },
};
