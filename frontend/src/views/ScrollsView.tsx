/**
 * Scrolls View — uploaded file library.
 *
 * Lists the user's uploaded PDFs and images from `/api/files/`. Supports
 * uploading new files (optionally assigned to a discipline) and deleting
 * existing ones. A rune icon distinguishes PDFs from images. The `processed`
 * flag shows whether ChromaDB indexing has completed.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { Subject } from "@/App";
import { API_FILES } from "@/config";

const API        = API_FILES;
const UPLOAD_URL = `${API_FILES}/upload`;

interface ExamQRow {
  id:              number;
  question_number: string;
  question_text:   string;
  marks:           number;
  page_number:     number;
}

interface FileRow {
  id:                  number;
  filename:            string;
  subject_id:          number | null;
  processed:           boolean;
  has_exam_questions:  boolean;
  question_count:      number;
}

interface ScrollsViewProps {
  subjects:  Subject[];
  authToken: string;
}

/**
 * File library view with upload and delete capabilities.
 *
 * @param subjects   - Used to populate the discipline selector for new uploads.
 * @param authToken  - JWT forwarded with all API requests.
 */
export default function ScrollsView({ subjects, authToken }: ScrollsViewProps) {
  const [files,          setFiles]          = useState<FileRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [uploadSubject,  setUploadSubject]  = useState<string>("");
  const [filterSubject,  setFilterSubject]  = useState<string>("");
  const [isDragOver,     setIsDragOver]     = useState(false);
  const [expandedFile,   setExpandedFile]   = useState<number | null>(null);
  const [fileQuestions,  setFileQuestions]  = useState<Record<number, ExamQRow[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleQuestions = useCallback(async (fileId: number) => {
    if (expandedFile === fileId) { setExpandedFile(null); return; }
    setExpandedFile(fileId);
    if (fileQuestions[fileId]) return;   // already fetched
    try {
      const res = await fetch(`${API}/${fileId}/questions`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const data = await res.json() as ExamQRow[];
        setFileQuestions((prev) => ({ ...prev, [fileId]: data }));
      }
    } catch { /* ignore */ }
  }, [expandedFile, fileQuestions, authToken]);

  const loadFiles = () => {
    setLoading(true);
    fetch(`${API}/`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then((r) => r.ok ? r.json() as Promise<FileRow[]> : [])
      .then((data) => { setFiles(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(loadFiles, [authToken]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadSubject) form.append("subject_id", uploadSubject);
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      if (res.ok) {
        const newFile = await res.json() as FileRow;
        setFiles((prev) => [newFile, ...prev]);
      }
    } catch { /* ignore */ }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok || res.status === 204) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      }
    } catch { /* ignore */ }
  };

  // ── Drag-and-drop upload ─────────────────────────────────
  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (uploadSubject) form.append("subject_id", uploadSubject);
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: form,
      });
      if (res.ok) {
        const newFile = await res.json() as FileRow;
        setFiles((prev) => [newFile, ...prev]);
      }
    } catch { /* ignore */ }
    finally { setUploading(false); }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const subjectName = (id: number | null) =>
    id ? subjects.find((s) => s.id === String(id))?.name ?? `Subject ${id}` : "—";

  /** Return a Norse rune character representing the file type (PDF / image / other). */
  const extRune = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "ᚱ";
    if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return "ᛇ";
    return "ᚦ";
  };

  return (
    <div
      style={{ ...styles.page, ...(isDragOver ? styles.pageDragOver : {}) }}
      className="scroll-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Header ── */}
      <div style={styles.pageHeader}>
        <span style={styles.headerRune}>ᚱ</span>
        <div>
          <div style={styles.headerTitle}>Scrolls</div>
          <div style={styles.headerSub}>Your uploaded knowledge</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {subjects.length > 0 && (
            <>
              {/* Filter the displayed file list by discipline */}
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                style={styles.subjectSelect}
                title="Filter by discipline"
              >
                <option value="">— all scrolls —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {/* Assign discipline to the next upload */}
              <select
                value={uploadSubject}
                onChange={(e) => setUploadSubject(e.target.value)}
                style={styles.subjectSelect}
                title="Assign discipline on upload"
              >
                <option value="">— upload to… —</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            style={{ display: "none" }}
            onChange={handleUpload}
          />
          <button
            style={styles.uploadBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "ᛋ Upload Scroll"}
          </button>
        </div>
      </div>
      <div style={styles.engraving} />

      {loading && <div style={styles.dimText}>Retrieving the scrolls…</div>}

      {!loading && files.length === 0 && (
        <div style={styles.emptyState}>
          <div style={styles.emptyRune}>ᚱ</div>
          <div style={styles.emptyTitle}>The vault is empty</div>
          <div style={styles.emptyText}>
            Upload a PDF or image and Mimir will extract its knowledge into memory.
          </div>
          <button
            style={styles.uploadBtnLarge}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload your first scroll
          </button>
        </div>
      )}

      {!loading && files.length > 0 && (() => {
        const visible = filterSubject
          ? files.filter((f) => String(f.subject_id) === filterSubject)
          : files;
        return (
        <div style={styles.fileList}>
          {/* Column headers */}
          <div style={styles.headerRow}>
            <span style={{ ...styles.colHeader, width: 16 }} />
            <span style={{ ...styles.colHeader, flex: 1 }}>Scroll</span>
            <span style={{ ...styles.colHeader, width: 100 }}>Discipline</span>
            <span style={{ ...styles.colHeader, width: 44 }}>Questions</span>
            <span style={{ ...styles.colHeader, width: 50 }}>Status</span>
            <span style={{ ...styles.colHeader, width: 20 }} />
          </div>

          {visible.length === 0 && (
            <div style={styles.dimText}>No scrolls for this discipline.</div>
          )}

          {visible.map((f) => (
            <div key={f.id}>
              <div style={styles.fileRow}>
                <span style={styles.fileIcon}>{extRune(f.filename)}</span>
                <span style={styles.fileName}>{f.filename}</span>
                <span style={styles.fileSubject}>{subjectName(f.subject_id)}</span>
                {/* Question badge — only shown for exam papers */}
                {f.has_exam_questions && f.question_count > 0 ? (
                  <button
                    style={styles.qBadge}
                    title="Show detected exam questions"
                    onClick={() => toggleQuestions(f.id)}
                  >
                    {expandedFile === f.id ? "▲" : "▼"} {f.question_count}Q
                  </button>
                ) : (
                  <span style={styles.qBadgeEmpty} />
                )}
                <span style={{
                  ...styles.fileStatus,
                  color: f.processed ? "var(--green-bright)" : "var(--gold-dim)",
                }}>
                  {f.processed ? "indexed" : "pending"}
                </span>
                <button
                  style={styles.deleteBtn}
                  title="Remove scroll"
                  onClick={() => handleDelete(f.id)}
                >×</button>
              </div>
              {/* Expanded question list */}
              {expandedFile === f.id && (
                <div style={styles.qPanel}>
                  {!fileQuestions[f.id] ? (
                    <div style={styles.qLoading}>Loading questions…</div>
                  ) : fileQuestions[f.id].length === 0 ? (
                    <div style={styles.qLoading}>No questions found.</div>
                  ) : (
                    fileQuestions[f.id].map((q) => (
                      <div key={q.id} style={styles.qRow}>
                        <span style={styles.qNum}>Q{q.question_number}</span>
                        <span style={styles.qText}>{q.question_text}</span>
                        <span style={styles.qMarks}>{q.marks}m</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        );
      })()}

      <div style={styles.hint}>
        Indexed scrolls become part of Mimir's memory. Ask about them in the Oracle. Drag a file here to upload.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { flex: 1, padding: "16px 20px", overflowY: "auto", background: "transparent", display: "flex", flexDirection: "column", transition: "outline 0.15s" },
  pageDragOver: { background: "var(--stone-2)", outline: "2px dashed var(--green)", outlineOffset: "-6px" },
  pageHeader:   { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:   { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle:  { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:    { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:    { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0 12px" },
  uploadBtn:    { background: "var(--green-dark)", border: "1px solid var(--green)", color: "var(--green-bright)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "6px 12px", cursor: "pointer" },
  subjectSelect:{ background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 11, padding: "4px 6px", outline: "none" },
  dimText:      { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", padding: "8px 0" },
  emptyState:   { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 10, padding: 32, textAlign: "center" as const },
  emptyRune:    { fontFamily: "var(--font-header)", fontSize: 40, color: "var(--green-dim)", lineHeight: 1 },
  emptyTitle:   { fontFamily: "var(--font-header)", fontSize: 12, letterSpacing: "0.14em", color: "var(--text-secondary)" },
  emptyText:    { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", maxWidth: 280, lineHeight: 1.6 },
  uploadBtnLarge: { marginTop: 8, background: "var(--green-dark)", border: "1px solid var(--green)", color: "var(--green-bright)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "9px 20px", cursor: "pointer" },
  fileList:     { display: "flex", flexDirection: "column" as const, gap: 3 },
  headerRow:    { display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", marginBottom: 2 },
  colHeader:    { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-dim)" },
  fileRow:      { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  fileIcon:     { fontFamily: "var(--font-header)", fontSize: 13, color: "var(--green-dim)", flexShrink: 0, lineHeight: 1 },
  fileName:     { fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  fileSubject:  { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", width: 100, flexShrink: 0, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  fileStatus:   { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", width: 50, flexShrink: 0, textAlign: "right" as const },
  deleteBtn:    { background: "none", border: "none", color: "var(--text-dim)", fontSize: 14, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0, transition: "color 0.1s" },
  hint:         { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: "auto", paddingTop: 12 },
  // Exam question badge & panel
  qBadge:       { background: "var(--gold-dark)", border: "1px solid var(--gold-dim)", color: "var(--gold)", fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.08em", padding: "2px 5px", cursor: "pointer", width: 44, flexShrink: 0, whiteSpace: "nowrap" as const },
  qBadgeEmpty:  { width: 44, flexShrink: 0 },
  qPanel:       { background: "var(--stone-1)", borderLeft: "2px solid var(--gold-dim)", borderBottom: "1px solid var(--green-dark)", margin: "0 0 2px 24px", padding: "6px 10px", display: "flex", flexDirection: "column" as const, gap: 4 },
  qLoading:     { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)" },
  qRow:         { display: "flex", alignItems: "baseline", gap: 8 },
  qNum:         { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--gold-dim)", flexShrink: 0, width: 32 },
  qText:        { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  qMarks:       { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--green-dim)", flexShrink: 0 },
};
