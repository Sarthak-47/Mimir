/**
 * AllChatsPanel — slide-in drawer showing every conversation across all
 * disciplines, grouped into date buckets (Today / Yesterday / This Week /
 * This Month / Older).  Mirrors the Claude.ai "all conversations" sidebar.
 *
 * Triggered by the ᚷ rune in the Topbar. Fetches
 * `GET /api/chronicle/sessions?limit=100` (no subject_id filter) so every
 * session appears regardless of which discipline it belongs to.
 */

import { useEffect, useState, useCallback } from "react";
import type { Subject } from "@/App";
import { API_CHRONICLE } from "@/config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MessageRow {
  id:         number;
  role:       string;
  content:    string;
  subject_id: number | null;
  timestamp:  string;
}

interface SessionRow {
  session_id: string;
  start_time: string;
  subject_id: number | null;
  turn_count: number;
  preview:    string;
  messages:   MessageRow[];
}

type DateBucket = "Today" | "Yesterday" | "This Week" | "This Month" | "Older";
const BUCKET_ORDER: DateBucket[] = ["Today", "Yesterday", "This Week", "This Month", "Older"];

interface AllChatsPanelProps {
  isOpen:        boolean;
  onClose:       () => void;
  authToken:     string;
  subjects:      Subject[];
  /** Called with the full message array when a session is selected. */
  onLoadSession: (messages: MessageRow[]) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateBucket(start_time: string): DateBucket {
  const d   = new Date(start_time);
  const now = new Date();
  const today     = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const monthAgo  = new Date(today); monthAgo.setDate(today.getDate() - 30);

  if (d >= today)     return "Today";
  if (d >= yesterday) return "Yesterday";
  if (d >= weekAgo)   return "This Week";
  if (d >= monthAgo)  return "This Month";
  return "Older";
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AllChatsPanel({
  isOpen, onClose, authToken, subjects, onLoadSession,
}: AllChatsPanelProps) {
  const [sessions,      setSessions]      = useState<SessionRow[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [hoveredSessId, setHoveredSessId] = useState<string | null>(null);

  // Fetch all sessions whenever the panel opens
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_CHRONICLE}/sessions?limit=100`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) setSessions(await res.json() as SessionRow[]);
    } catch { /* backend offline — keep stale list */ }
    finally { setLoading(false); }
  }, [authToken]);

  const handleDelete = useCallback(async (sess: SessionRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(sess.session_id);
    try {
      const ids = sess.messages.map((m) => m.id);
      const res = await fetch(`${API_CHRONICLE}/messages`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.session_id !== sess.session_id));
      }
    } catch { /* silent */ }
    finally { setDeletingId(null); }
  }, [authToken]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // Subject helpers
  const subjectColor = (id: number | null): string =>
    subjects.find((s) => s.id === String(id))?.color ?? "var(--text-dim)";
  const subjectName = (id: number | null): string =>
    subjects.find((s) => s.id === String(id))?.name ?? "General";

  // Group sessions by date bucket
  const groups: Partial<Record<DateBucket, SessionRow[]>> = {};
  for (const s of sessions) {
    const b = dateBucket(s.start_time);
    (groups[b] ??= []).push(s);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Click-away backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.45)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity 0.22s",
        }}
      />

      {/* ── Slide-in panel ── */}
      <aside style={{
        position:   "fixed",
        top:        0,
        right:      0,
        bottom:     0,
        width:      310,
        background: "var(--stone-1)",
        borderLeft: "1px solid var(--gold-dark)",
        zIndex:     200,
        display:    "flex",
        flexDirection: "column",
        transform:  isOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
        boxShadow:  isOpen ? "-6px 0 32px rgba(0,0,0,0.7)" : "none",
      }}>

        {/* ── Header ── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={S.headerRune}>ᚷ</span>
            <span style={S.headerTitle}>All Conversations</span>
          </div>
          <button
            style={S.closeBtn}
            onClick={onClose}
            title="Close"
          >✕</button>
        </div>

        {/* ── Gold engraving ── */}
        <div style={S.engraving} />

        {/* ── Session list ── */}
        <div style={S.list} className="scroll-area">

          {loading && (
            <div style={S.dimText}>Consulting the runes…</div>
          )}

          {!loading && sessions.length === 0 && (
            <div style={S.dimText}>No conversations yet — speak to the Oracle.</div>
          )}

          {!loading && BUCKET_ORDER.filter((b) => groups[b]?.length).map((bucket) => (
            <div key={bucket}>
              {/* Date group header */}
              <div style={S.bucketLabel}>{bucket}</div>

              {groups[bucket]!.map((sess) => (
                <div
                  key={sess.session_id}
                  style={{
                    ...S.sessionBtn,
                    background: hoveredSessId === sess.session_id ? "var(--stone-3)" : "transparent",
                    position: "relative",
                  }}
                  onMouseEnter={() => setHoveredSessId(sess.session_id)}
                  onMouseLeave={() => setHoveredSessId(null)}
                  onClick={() => { onLoadSession(sess.messages); onClose(); }}
                >
                  {/* Top row: discipline dot + name + date */}
                  <div style={S.sessionTop}>
                    <div style={S.sessionLeft}>
                      <span style={{
                        ...S.dot,
                        background: subjectColor(sess.subject_id),
                      }} />
                      <span style={S.disciplineLabel}>
                        {subjectName(sess.subject_id)}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={S.dateLabel}>{shortDate(sess.start_time)}</span>
                      {/* Delete button — visible on hover */}
                      {hoveredSessId === sess.session_id && (
                        <button
                          title="Delete session"
                          style={S.deleteBtn}
                          onClick={(e) => handleDelete(sess, e)}
                          disabled={deletingId === sess.session_id}
                        >
                          {deletingId === sess.session_id ? "…" : "✕"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preview text */}
                  <div style={S.preview}>{sess.preview || "…"}</div>

                  {/* Turn count */}
                  <div style={S.turnCount}>{sess.turn_count} turns</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  header: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 10px",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex", alignItems: "center", gap: 8,
  },
  headerRune: {
    fontFamily: "var(--font-header)", fontSize: 18,
    color: "var(--gold-dim)", lineHeight: 1,
  },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
  },
  closeBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 14, cursor: "pointer", lineHeight: 1,
    padding: "2px 4px", transition: "color 0.15s",
  },
  engraving: {
    height: 1, flexShrink: 0,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.35,
  },
  list: {
    flex: 1, overflowY: "auto", overflowX: "hidden",
  },
  dimText: {
    padding: "14px", fontFamily: "var(--font-body)",
    fontSize: 12, fontStyle: "italic", color: "var(--text-dim)",
  },
  bucketLabel: {
    padding: "10px 14px 4px",
    fontFamily: "var(--font-header)", fontSize: 9,
    letterSpacing: "0.18em", textTransform: "uppercase" as const,
    color: "var(--text-dim)",
  },
  sessionBtn: {
    display: "flex", flexDirection: "column" as const, gap: 3,
    width: "100%", textAlign: "left" as const,
    background: "transparent", border: "none",
    borderBottom: "1px solid var(--stone-3)",
    padding: "9px 14px", cursor: "pointer",
    transition: "background 0.12s",
    fontFamily: "inherit",
  },
  sessionTop: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 6,
  },
  sessionLeft: {
    display: "flex", alignItems: "center", gap: 5, minWidth: 0,
  },
  dot: {
    width: 6, height: 6, borderRadius: "50%",
    flexShrink: 0, display: "inline-block",
  },
  disciplineLabel: {
    fontFamily: "var(--font-header)", fontSize: 9,
    letterSpacing: "0.1em", textTransform: "uppercase" as const,
    color: "var(--text-dim)",
    whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
    maxWidth: 150,
  },
  dateLabel: {
    fontFamily: "var(--font-body)", fontSize: 10,
    color: "var(--text-dim)", flexShrink: 0,
  },
  preview: {
    fontFamily: "var(--font-body)", fontSize: 12,
    color: "var(--text-secondary)", lineHeight: 1.4,
    whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
  },
  turnCount: {
    fontFamily: "var(--font-header)", fontSize: 9,
    letterSpacing: "0.08em", color: "var(--text-dim)",
  },
  deleteBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", cursor: "pointer",
    fontFamily: "var(--font-header)", fontSize: 10,
    padding: "1px 3px", lineHeight: 1,
    transition: "color 0.12s",
    flexShrink: 0,
  },
};
