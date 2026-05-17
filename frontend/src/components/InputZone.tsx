/**
 * @fileoverview Chat input bar with quick-action rune buttons.
 *
 * Renders a self-resizing textarea (Enter to send, Shift+Enter for newline),
 * a send button, and four rune action buttons: SCROLL (file upload), TRIAL
 * (quiz), RUNES (flashcards), and FATES (revision schedule). An active-subject
 * badge is shown when a discipline is selected.
 */

import { useState, useRef, useCallback } from "react";

interface InputZoneProps {
  onSend:         (text: string, mode: string, images?: string[]) => void;
  onTrial:        () => void;
  onRunes:        () => void;
  onFates:        () => void;
  onStartLesson:  (topicName: string) => void;
  activeSubjectName: string | null;
  authToken?: string | null;
  mode: string;
  onModeChange: (mode: string) => void;
}

import { API_FILES } from "@/config";
const UPLOAD_URL = `${API_FILES}/upload`;

/**
 * Bottom chat input zone with quick-action buttons.
 *
 * @param onSend             - Called with the trimmed message text on submit.
 * @param onTrial            - Called when the TRIAL (quiz) button is clicked.
 * @param onRunes            - Called when the RUNES (flashcards) button is clicked.
 * @param onFates            - Called when the FATES (schedule) button is clicked.
 * @param activeSubjectName  - Displayed as a badge; null hides the badge.
 * @param authToken          - JWT forwarded with file upload requests.
 */
export default function InputZone({
  onSend, onTrial, onRunes, onFates, onStartLesson, activeSubjectName, authToken, mode, onModeChange,
}: InputZoneProps) {
  const [text,          setText]          = useState("");
  const [uploading,     setUploading]     = useState(false);
  // Pending images to attach to the next message — stored as {base64, dataUrl} objects.
  // dataUrl is used for the preview thumbnail; base64 is sent to the backend.
  const [pendingImages, setPendingImages] = useState<{ base64: string; dataUrl: string }[]>([]);
  const [isDragOver,    setIsDragOver]    = useState(false);
  // Lesson topic picker state
  const [showLessonPicker, setShowLessonPicker] = useState(false);
  const [lessonTopic,      setLessonTopic]      = useState("");
  const lessonInputRef = useRef<HTMLInputElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Key handler ─────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim() && pendingImages.length === 0) return;
    const images = pendingImages.map((img) => img.base64);
    onSend(text, mode, images.length > 0 ? images : undefined);
    setText("");
    setPendingImages([]);
    setIsDragOver(false);
    if (textareaRef.current) textareaRef.current.style.height = "34px";
    textareaRef.current?.focus();
  };

  // ── Image helpers ────────────────────────────────────────

  /** Convert a File/Blob to a {base64, dataUrl} record and add to pending. */
  const addImageFile = useCallback((file: File | Blob) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (!dataUrl) return;
      // DataURL format: "data:<type>;base64,<data>"
      const base64 = dataUrl.split(",")[1];
      if (base64) {
        setPendingImages((prev) => {
          if (prev.length >= 3) return prev;   // cap at 3 images
          return [...prev, { base64, dataUrl }];
        });
      }
    };
    reader.readAsDataURL(file);
  }, []);

  /** Handle clipboard paste — extract image files if present. */
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));
    if (imageItems.length === 0) return;   // let normal text paste proceed
    e.preventDefault();
    imageItems.forEach((item) => {
      const blob = item.getAsFile();
      if (blob) addImageFile(blob);
    });
  }, [addImageFile]);

  /** Handle drag-over — set visual indicator. */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  // ── Lesson picker ────────────────────────────────────────
  const handleLessonOpen = () => {
    setShowLessonPicker(true);
    // Focus the input on next tick
    setTimeout(() => lessonInputRef.current?.focus(), 50);
  };

  const handleLessonConfirm = () => {
    if (!lessonTopic.trim()) return;
    onStartLesson(lessonTopic.trim());
    setLessonTopic("");
    setShowLessonPicker(false);
  };

  const handleLessonKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLessonConfirm();
    if (e.key === "Escape") { setShowLessonPicker(false); setLessonTopic(""); }
  };

  /** Handle drop — accept image files. */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    files.forEach(addImageFile);
  }, [addImageFile]);

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
        onSend(`I just uploaded "${file.name}". Please summarise it for me.`, mode);
      } else {
        onSend(`Failed to upload "${file.name}" — server returned ${res.status}.`, mode);
      }
    } catch {
      onSend(`Upload failed — make sure the backend is running.`, mode);
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Teaching mode configuration ─────────────────────────
  const MODES = [
    { key: "detailed",   label: "DEEP",   rune: "ᛞ", title: "Deep mode — thorough professor-style explanations with checkpoint questions" },
    { key: "fast",       label: "SWIFT",  rune: "ᛊ", title: "Swift mode — brief, direct answers" },
    { key: "beginner",   label: "BASIC",  rune: "ᚱ", title: "Basic mode — simplified analogies, no assumed prior knowledge" },
    { key: "exam",       label: "EXAM",   rune: "ᛏ", title: "Exam mode — high-yield content, common mistakes, exam tips" },
    { key: "coding",     label: "CODE",   rune: "ᚲ", title: "Code mode — implementation-focused, practical examples" },
    { key: "derivation", label: "MATH",   rune: "ᛜ", title: "Math mode — step-by-step derivations from first principles" },
    { key: "socratic",   label: "SOKR",   rune: "ᛝ", title: "Socratic mode — guiding questions only, student reasons toward the answer" },
  ] as const;

  const currentModeIdx = MODES.findIndex((m) => m.key === mode);
  const currentMode    = MODES[currentModeIdx >= 0 ? currentModeIdx : 0];

  const cycleMode = () => {
    const nextIdx = (currentModeIdx + 1) % MODES.length;
    onModeChange(MODES[nextIdx].key);
  };

  // ── Rune action buttons config ───────────────────────────
  const ACTIONS = [
    { icon: "ᛋ", label: uploading ? "…" : "SCROLL", title: "Upload PDF or image",              onClick: handleScrollClick, disabled: uploading },
    { icon: "ᛚ", label: "LESSON", title: "Start an interactive tutor session",      onClick: handleLessonOpen,  disabled: false },
    { icon: "ᛏ", label: "TRIAL",  title: "Quiz me on the active subject",           onClick: onTrial,           disabled: false },
    { icon: "ᚠ", label: "RUNES",  title: "Generate flashcards",                     onClick: onRunes,           disabled: false },
    { icon: "ᚾ", label: "FATES",  title: "Build a revision schedule",               onClick: onFates,           disabled: false },
  ];

  return (
    <div
      style={{ ...styles.inputZone, ...(isDragOver ? styles.inputZoneDragOver : {}) }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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

      {/* Pending image preview strip */}
      {pendingImages.length > 0 && (
        <div style={styles.imageStrip}>
          {pendingImages.map((img, i) => (
            <div key={i} style={styles.imageThumbWrap}>
              <img src={img.dataUrl} alt={`Attached image ${i + 1}`} style={styles.imageThumb} />
              <button
                style={styles.imageRemoveBtn}
                onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                title="Remove image"
              >×</button>
            </div>
          ))}
          <span style={styles.imageCount}>
            {pendingImages.length}/3 image{pendingImages.length !== 1 ? "s" : ""} attached
          </span>
        </div>
      )}

      {/* Drag-to-attach hint overlay */}
      {isDragOver && (
        <div style={styles.dragOverlay}>
          <span style={styles.dragHint}>ᛋ Drop image to attach</span>
        </div>
      )}

      {/* ── Lesson topic picker ── */}
      {showLessonPicker && (
        <div style={styles.lessonPicker}>
          <span style={styles.lessonLabel}>ᛚ Topic:</span>
          <input
            ref={lessonInputRef}
            type="text"
            value={lessonTopic}
            onChange={(e) => setLessonTopic(e.target.value)}
            onKeyDown={handleLessonKeyDown}
            placeholder="e.g. Photosynthesis, Dijkstra's algorithm…"
            style={styles.lessonInput}
          />
          <button
            style={{ ...styles.lessonBtn, ...(lessonTopic.trim() ? styles.lessonBtnActive : {}) }}
            onClick={handleLessonConfirm}
            disabled={!lessonTopic.trim()}
          >Begin</button>
          <button
            style={styles.lessonCancel}
            onClick={() => { setShowLessonPicker(false); setLessonTopic(""); }}
          >×</button>
        </div>
      )}

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

        {/* Teaching mode cycle */}
        <button
          style={{
            ...styles.runeBtn,
            ...(mode !== "detailed" ? styles.runeBtnActive : {}),
            marginLeft: 4,
          }}
          title={currentMode.title}
          onClick={cycleMode}
        >
          <span style={styles.runeBtnIcon}>{currentMode.rune}</span>
          <span style={styles.runeBtnLabel}>{currentMode.label}</span>
        </button>

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
          onPaste={handlePaste}
          placeholder={pendingImages.length > 0 ? "Add a message (or send image only)…" : "Speak your query to Mimir…"}
          style={styles.textarea}
          rows={1}
        />
        <button
          style={{
            ...styles.sendBtn,
            ...((text.trim() || pendingImages.length > 0) ? styles.sendBtnActive : {}),
          }}
          onClick={handleSend}
          disabled={!text.trim() && pendingImages.length === 0}
          title="Send (Enter)"
        >
          <span style={styles.sendRune}>ᛊ</span>
        </button>
      </div>

      <div style={styles.hint}>Enter to send · Shift+Enter for newline · Paste or drop images to attach</div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  inputZone:         { background: "var(--stone-2)", borderTop: "1px solid var(--green-dark)", padding: "0 12px 8px", flexShrink: 0, position: "relative" },
  inputZoneDragOver: { borderColor: "var(--gold)", boxShadow: "inset 0 0 0 2px var(--gold-dim)" },
  imageStrip:        { display: "flex", alignItems: "center", gap: 8, padding: "6px 0 4px", flexWrap: "wrap" as const },
  imageThumbWrap:    { position: "relative" as const, flexShrink: 0 },
  imageThumb:        { width: 56, height: 56, objectFit: "cover" as const, border: "1px solid var(--green-dark)", display: "block" },
  imageRemoveBtn:    { position: "absolute" as const, top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "var(--stone-4)", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontSize: 10, lineHeight: "14px", cursor: "pointer", textAlign: "center" as const, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  imageCount:        { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)" },
  dragOverlay:       { position: "absolute" as const, inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, pointerEvents: "none" as const },
  dragHint:          { fontFamily: "var(--font-header)", fontSize: 13, letterSpacing: "0.12em", color: "var(--gold-bright)" },
  engravingTop: { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.3, marginBottom: 8 },
  runeStrip: { display: "flex", alignItems: "center", gap: 4, marginBottom: 6 },
  runeBtn: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 1, padding: "4px 9px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", cursor: "pointer", transition: "all 0.15s" },
  runeBtnActive: { background: "var(--green-dark)", borderColor: "var(--green)" },
  runeBtnDisabled: { opacity: 0.5, cursor: "not-allowed" },
  runeBtnIcon:  { fontSize: 17, lineHeight: 1, fontFamily: "var(--font-header)", color: "var(--green)" },
  runeBtnLabel: { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" as const },
  activeSubjectBadge: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: "var(--stone-3)", border: "1px solid var(--green-dark)" },
  diamond: { display: "inline-block", width: 6, height: 6, background: "var(--green-bright)", transform: "rotate(45deg)", flexShrink: 0 },
  activeSubjectText: { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-secondary)", textTransform: "uppercase" as const },
  inputRow: { display: "flex", gap: 6, alignItems: "flex-end" },
  textarea: { flex: 1, background: "var(--stone-1)", border: "1px solid var(--green-dark)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 15, padding: "8px 12px", outline: "none", resize: "none" as const, minHeight: 38, maxHeight: 130, lineHeight: 1.5 },
  sendBtn: { width: 38, height: 38, background: "var(--stone-3)", border: "1px solid var(--green-dark)", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.5, transition: "all 0.15s" },
  sendBtnActive: { background: "var(--green-dark)", borderColor: "var(--green)", cursor: "pointer", opacity: 1 },
  sendRune: { fontFamily: "var(--font-header)", fontSize: 18, color: "var(--green-bright)", lineHeight: 1 },
  hint: { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginTop: 3, textAlign: "center" as const },
  lessonPicker: { display: "flex", alignItems: "center", gap: 6, padding: "5px 0 3px", borderBottom: "1px solid var(--green-dark)", marginBottom: 4 },
  lessonLabel: { fontFamily: "var(--font-header)", fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", flexShrink: 0 },
  lessonInput: { flex: 1, background: "var(--stone-1)", border: "1px solid var(--green-dark)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, padding: "4px 8px", outline: "none" },
  lessonBtn: { padding: "4px 12px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", cursor: "not-allowed", flexShrink: 0 },
  lessonBtnActive: { background: "var(--green-dark)", borderColor: "var(--green)", color: "var(--green-bright)", cursor: "pointer" },
  lessonCancel: { background: "none", border: "none", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 15, cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0 },
};
