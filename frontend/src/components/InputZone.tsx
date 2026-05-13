import { useState, useRef } from "react";

interface InputZoneProps {
  onSend: (text: string) => void;
  activeSubject: string | null;
}

// ── Action buttons in the rune strip ────────────────────────
const RUNE_ACTIONS = [
  { icon: "📤", label: "SCROLL", title: "Upload PDF or image" },
  { icon: "🛡", label: "TRIAL",  title: "Start a quiz on active subject" },
  { icon: "🃏", label: "RUNES",  title: "Generate flashcards from session" },
  { icon: "📅", label: "FATES",  title: "Open revision schedule" },
];

export default function InputZone({ onSend, activeSubject }: InputZoneProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
    textareaRef.current?.focus();
  };

  return (
    <div style={styles.inputZone}>
      {/* Gold engraving top border */}
      <div style={styles.engravingTop} />

      {/* ── Rune action strip ── */}
      <div style={styles.runeStrip}>
        {RUNE_ACTIONS.map(({ icon, label, title }) => (
          <button key={label} style={styles.runeBtn} title={title}>
            <span style={styles.runeBtnIcon}>{icon}</span>
            <span style={styles.runeBtnLabel}>{label}</span>
          </button>
        ))}

        {activeSubject && (
          <div style={styles.activeSubjectBadge}>
            <span style={styles.diamond} />
            <span style={styles.activeSubjectText}>{activeSubject}</span>
          </div>
        )}
      </div>

      {/* ── Text input + send ── */}
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Speak your query to Mimir..."
          style={styles.textarea}
          rows={1}
        />
        <button
          style={{
            ...styles.sendBtn,
            ...(text.trim() ? styles.sendBtnActive : {}),
          }}
          onClick={handleSend}
          disabled={!text.trim()}
          title="Send (Enter)"
        >
          <span style={styles.sendRune}>ᛊ</span>
        </button>
      </div>

      <div style={styles.hint}>
        Enter to send · Shift+Enter for new line
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  inputZone: {
    background: "var(--stone-2)",
    borderTop: "1px solid var(--green-dark)",
    padding: "0 12px 8px",
    flexShrink: 0,
    position: "relative",
  },
  engravingTop: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.3,
    marginBottom: 8,
  },
  runeStrip: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 6,
  },
  runeBtn: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 1,
    padding: "3px 7px",
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  runeBtnIcon: {
    fontSize: 13,
    lineHeight: 1,
  },
  runeBtnLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 7,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
  },
  activeSubjectBadge: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "2px 8px",
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
  },
  diamond: {
    display: "inline-block",
    width: 5,
    height: 5,
    background: "var(--green-bright)",
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  activeSubjectText: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.1em",
    color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
  },
  inputRow: {
    display: "flex",
    gap: 6,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    padding: "7px 10px",
    outline: "none",
    resize: "none" as const,
    minHeight: 34,
    maxHeight: 120,
    lineHeight: 1.5,
  },
  sendBtn: {
    width: 34,
    height: 34,
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    cursor: "not-allowed",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    opacity: 0.5,
    transition: "all 0.15s",
  },
  sendBtnActive: {
    background: "var(--green-dark)",
    borderColor: "var(--green)",
    cursor: "pointer",
    opacity: 1,
  },
  sendRune: {
    fontFamily: "var(--font-header)",
    fontSize: 16,
    color: "var(--green-bright)",
    lineHeight: 1,
  },
  hint: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    color: "var(--text-dim)",
    fontStyle: "italic",
    marginTop: 3,
    textAlign: "center" as const,
  },
};
