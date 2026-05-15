/**
 * Chronicle View — conversation history browser.
 *
 * Fetches the most recent 100 conversation turns from `/api/chronicle` and
 * renders them in a chat-bubble layout identical to the Oracle view. Bold
 * markdown is highlighted in gold via `TermHighlight`. The fetch is
 * cancelled on unmount to prevent state updates on stale components.
 */

import { useEffect, useState } from "react";
import { API_CHRONICLE as API } from "@/config";

interface ConvRow {
  id:         number;
  role:       "user" | "assistant";
  content:    string;
  timestamp:  string;
  subject_id: number | null;
}

interface ChronicleViewProps {
  authToken: string;
  username?: string;
}

/**
 * Render a string with `**bold**` markdown replaced by gold-coloured `<span>` elements.
 *
 * Duplicated from `Chat.tsx` to keep the Chronicle view self-contained.
 */
function TermHighlight({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span key={i} style={{ color: "var(--gold-bright)", fontWeight: 600 }}>{part}</span>
          : part
      )}
    </>
  );
}

/**
 * Paginated read-only view of past conversations.
 *
 * @param authToken - JWT for authenticated API calls.
 * @param username  - Used to derive the user avatar initial in message bubbles.
 */
export default function ChronicleView({ authToken, username }: ChronicleViewProps) {
  const userInitial = (username?.[0] ?? "?").toUpperCase();
  const [rows,    setRows]    = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}?limit=100`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<ConvRow[]>;
      })
      .then((data) => { if (!cancelled) { setRows(data); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [authToken]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString([], {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div style={styles.page} className="scroll-area">
      {/* ── Header ── */}
      <div style={styles.pageHeader}>
        <span style={styles.headerRune}>ᛊ</span>
        <div>
          <div style={styles.headerTitle}>Chronicle</div>
          <div style={styles.headerSub}>Records of past sessions</div>
        </div>
      </div>
      <div style={styles.engraving} />

      {loading && <div style={styles.dimText}>Summoning past records…</div>}
      {error   && <div style={styles.dimText}>Could not fetch chronicle: {error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div style={styles.dimText}>
          No conversations yet. Visit the Oracle and speak your first query.
        </div>
      )}

      <div style={styles.messageList}>
        {rows.map((row) => {
          const isUser = row.role === "user";
          return (
            <div
              key={row.id}
              style={{
                ...styles.row,
                justifyContent: isUser ? "flex-end" : "flex-start",
              }}
            >
              {!isUser && <div style={styles.avatar}>M</div>}
              <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.mimirBubble) }}>
                  <div style={styles.sender}>
                    {isUser ? "You" : "Mimir"}
                    <span style={styles.time}>{formatTime(row.timestamp)}</span>
                  </div>
                  <div style={styles.content}>
                    {row.role === "assistant"
                      ? <TermHighlight text={row.content} />
                      : row.content}
                  </div>
                </div>
              </div>
              {isUser && <div style={styles.avatarUser}>{userInitial}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:        { flex: 1, padding: "16px 20px", overflowY: "auto", background: "var(--stone-1)", display: "flex", flexDirection: "column", gap: 0 },
  pageHeader:  { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:  { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle: { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:   { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:   { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0 12px" },
  dimText:     { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", padding: "8px 0" },
  messageList: { display: "flex", flexDirection: "column", gap: 8 },
  row:         { display: "flex", alignItems: "flex-end", gap: 8 },
  avatar:      { width: 24, height: 24, background: "var(--stone-3)", border: "1px solid var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-header)", fontSize: 11, fontWeight: 700, color: "var(--gold)", flexShrink: 0 },
  avatarUser:  { width: 24, height: 24, background: "var(--stone-3)", border: "1px solid var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-header)", fontSize: 11, fontWeight: 700, color: "var(--gold)", flexShrink: 0 },
  bubble:      { padding: "7px 11px" },
  mimirBubble: { background: "var(--stone-3)", border: "1px solid var(--green-dark)", borderLeft: "2px solid var(--green)" },
  userBubble:  { background: "var(--stone-4)", border: "1px solid var(--gold-dim)", borderRight: "2px solid var(--gold-dim)" },
  sender:      { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-dim)", display: "flex", justifyContent: "space-between", marginBottom: 3 },
  time:        { fontFamily: "var(--font-body)", fontSize: 8, color: "var(--text-dim)", fontStyle: "italic", textTransform: "none" as const },
  content:     { fontFamily: "var(--font-body)", fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
};
