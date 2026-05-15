/**
 * Scrolls View — uploaded file library.
 * Lists files from /api/files/ with processed status.
 */

import { useEffect, useRef, useState } from "react";
import type { Subject } from "@/App";
import { API_FILES } from "@/config";

const API        = API_FILES;
const UPLOAD_URL = `${API_FILES}/upload`;

interface FileRow {
  id:         number;
  filename:   string;
  subject_id: number | null;
  processed:  boolean;
}

interface ScrollsViewProps {
  subjects:  Subject[];
  authToken: string;
}

export default function ScrollsView({ subjects, authToken }: ScrollsViewProps) {
  const [files,          setFiles]          = useState<FileRow[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [uploading,      setUploading]      = useState(false);
  const [uploadSubject,  setUploadSubject]  = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const subjectName = (id: number | null) =>
    id ? subjects.find((s) => s.id === String(id))?.name ?? `Subject ${id}` : "—";

  const extRune = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "ᚱ";
    if (["png", "jpg", "jpeg", "webp"].includes(ext ?? "")) return "ᛇ";
    return "ᚦ";
  };

  return (
    <div style={styles.page} className="scroll-area">
      {/* ── Header ── */}
      <div style={styles.pageHeader}>
        <span style={styles.headerRune}>ᚱ</span>
        <div>
          <div style={styles.headerTitle}>Scrolls</div>
          <div style={styles.headerSub}>Your uploaded knowledge</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {subjects.length > 0 && (
            <select
              value={uploadSubject}
              onChange={(e) => setUploadSubject(e.target.value)}
              style={styles.subjectSelect}
              title="Assign discipline on upload"
            >
              <option value="">— discipline —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
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

      {!loading && files.length > 0 && (
        <div style={styles.fileList}>
          {/* Column headers */}
          <div style={styles.headerRow}>
            <span style={{ ...styles.colHeader, width: 16 }} />
            <span style={{ ...styles.colHeader, flex: 1 }}>Scroll</span>
            <span style={{ ...styles.colHeader, width: 100 }}>Discipline</span>
            <span style={{ ...styles.colHeader, width: 50 }}>Status</span>
            <span style={{ ...styles.colHeader, width: 20 }} />
          </div>

          {files.map((f) => (
            <div key={f.id} style={styles.fileRow}>
              <span style={styles.fileIcon}>{extRune(f.filename)}</span>
              <span style={styles.fileName}>{f.filename}</span>
              <span style={styles.fileSubject}>{subjectName(f.subject_id)}</span>
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
          ))}
        </div>
      )}

      <div style={styles.hint}>
        Indexed scrolls become part of Mimir's memory. Ask about them in the Oracle.
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { flex: 1, padding: "16px 20px", overflowY: "auto", background: "var(--stone-1)", display: "flex", flexDirection: "column" },
  pageHeader:   { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:   { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle:  { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:    { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:    { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0 12px" },
  uploadBtn:    { background: "var(--green-dark)", border: "1px solid var(--green)", color: "var(--green-bright)", fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "6px 12px", cursor: "pointer" },
  subjectSelect:{ background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 11, padding: "4px 6px", outline: "none" },
  dimText:      { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", padding: "8px 0" },
  emptyState:   { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 10, padding: 32, textAlign: "center" as const },
  emptyRune:    { fontFamily: "var(--font-header)", fontSize: 40, color: "var(--green-dim)", lineHeight: 1 },
  emptyTitle:   { fontFamily: "var(--font-header)", fontSize: 12, letterSpacing: "0.14em", color: "var(--text-secondary)" },
  emptyText:    { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", maxWidth: 280, lineHeight: 1.6 },
  uploadBtnLarge: { marginTop: 8, background: "var(--green-dark)", border: "1px solid var(--green)", color: "var(--green-bright)", fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const, padding: "9px 20px", cursor: "pointer" },
  fileList:     { display: "flex", flexDirection: "column" as const, gap: 3 },
  headerRow:    { display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", marginBottom: 2 },
  colHeader:    { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-dim)" },
  fileRow:      { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  fileIcon:     { fontFamily: "var(--font-header)", fontSize: 13, color: "var(--green-dim)", flexShrink: 0, lineHeight: 1 },
  fileName:     { fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  fileSubject:  { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", width: 100, flexShrink: 0, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  fileStatus:   { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", width: 50, flexShrink: 0, textAlign: "right" as const },
  deleteBtn:    { background: "none", border: "none", color: "var(--text-dim)", fontSize: 14, lineHeight: 1, cursor: "pointer", padding: "0 2px", flexShrink: 0, transition: "color 0.1s" },
  hint:         { fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)", marginTop: "auto", paddingTop: 12 },
};
