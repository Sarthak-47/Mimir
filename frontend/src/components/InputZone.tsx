import { useState, useRef } from "react";

interface InputZoneProps {
  onSend:    (text: string) => void;
  onTrial:   () => void;
  onRunes:   () => void;
  onFates:   () => void;
  activeSubjectName: string | null;
  authToken?: string | null;
}

import { API_FILES } from "@/config";
const UPLOAD_URL = `${API_FILES}/upload`;

export default function InputZone({
  onSend, onTrial, onRunes, onFates, activeSubjectName, authToken,
}: InputZoneProps) {
  const [text, setText]         = useState("");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Key handler ─────────────────────────────────────────
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
    // Reset textarea height after clearing
    if (textareaRef.current) textareaRef.current.style.height = "34px";
    textareaRef.current?.focus();
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize up to maxHeight
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // ── SCROLL — file upload ─────────────────────────────────
  const handleScrollClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);

      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(UPLOAD_URL, { method: "POST", body: form, headers });
      if (res.ok) {
        onSend(`I just uploaded "${file.name}". Please summarise it for me.`);
      } else {
        onSend(`Failed to upload "${file.name}" — server returned ${res.status}.`);
      }
    } catch {
      onSend(`Upload failed — make sure the backend is running.`);
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Rune action buttons config ───────────────────────────
  const ACTIONS = [
    { icon: "📤", label: uploading ? "…" : "SCROLL", title: "Upload PDF or image", onClick: handleScrollClick, disabled: uploading },
    { icon: "🛡",  label: "TRIAL",  title: "Quiz me on the active subject", onClick: onTrial,  disabled: false },
    { icon: "🃏",  label: "RUNES",  title: "Generate flashcards",            onClick: onRunes,  disabled: false },
    { icon: "📅",  label: "FATES",  title: "Build a revision schedule",      onClick: onFates,  disabled: false },
  ];

  return (
    <div style={styles.inputZone}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Gold engraving top border */}
      <div style={styles.engravingTop} />

      {/* ── Rune action strip ── */}
      <div style={styles.runeStrip}>
        {ACTIONS.map(({ icon, label, title, onClick, disabled }) => (
          <button
            key={label}
            style={{
              ...styles.runeBtn,
              ...(disabled ? styles.runeBtnDisabled : {}),
            }}
            title={title}
            onClick={onClick}
            disabled={disabled}
          >
            <span style={styles.runeBtnIcon}>{icon}</span>
            <span style={styles.runeBtnLabel}>{label}</span>
          </button>
        ))}

        {activeSubjectName && (
          <div style={styles.activeSubjectBadge}>
            <span style={styles.diamond} />
            <span style={styles.activeSubjectText}>{activeSubjectName}</span>
          </div>
        )}
      </div>

      {/* ── Text input + send ── */}
      <div style={styles.inputRow}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
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

      <div style={styles.hint}>Enter to send · Shift+Enter for new line</div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  inputZone: { background: "var(--stone-2)", borderTop: "1px solid var(--green-dark)", padding: "0 12px 8px", flexShrink: 0, position: "relative" },
  engravingTop: { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.3, marginBottom: 8 },
  runeStrip: { display: "flex", alignItems: "center", gap: 4, marginBottom: 6 },
  runeBtn: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 1, padding: "3px 7px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", cursor: "pointer", transition: "all 0.15s" },
  runeBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  runeBtnIcon:  { fontSize: 13, lineHeight: 1 },
  runeBtnLabel: { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" as const },
  activeSubjectBadge: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", background: "var(--stone-3)", border: "1px solid var(--green-dark)" },
  diamond: { display: "inline-block", width: 5, height: 5, background: "var(--green-bright)", transform: "rotate(45deg)", flexShrink: 0 },
  activeSubjectText: { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" as const },
  inputRow: { display: "flex", gap: 6, alignItems: "flex-end" },
  textarea: { flex: 1, background: "var(--stone-1)", border: "1px solid var(--green-dark)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 14, padding: "7px 10px", outline: "none", resize: "none" as const, minHeight: 34, maxHeight: 120, lineHeight: 1.5 },
  sendBtn: { width: 34, height: 34, background: "var(--stone-3)", border: "1px solid var(--green-dark)", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5, transition: "all 0.15s" },
  sendBtnActive: { background: "var(--green-dark)", borderColor: "var(--green)", cursor: "pointer", opacity: 1 },
  sendRune: { fontFamily: "var(--font-header)", fontSize: 16, color: "var(--green-bright)", lineHeight: 1 },
  hint: { fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-dim)", fontStyle: "italic", marginTop: 3, textAlign: "center" as const },
};
