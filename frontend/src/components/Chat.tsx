import { useEffect, useRef } from "react";
import type { Message } from "@/App";

interface ChatProps {
  messages: Message[];
}

export default function Chat({ messages }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={styles.chatArea} className="scroll-area">
      {messages.length === 0 && <EmptyState />}

      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            ...styles.row,
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          {msg.role === "assistant" && (
            <div style={styles.avatar}>ᚦ</div>
          )}
          <div
            style={{
              ...styles.bubble,
              ...(msg.role === "assistant" ? styles.mimirBubble : styles.userBubble),
            }}
          >
            <div style={styles.sender}>
              {msg.role === "assistant" ? "Mimir" : "You"}
              <span style={styles.time}>{formatTime(msg.timestamp)}</span>
            </div>
            <div style={styles.content}>{msg.content}</div>
          </div>
          {msg.role === "user" && (
            <div style={styles.avatarUser}>S</div>
          )}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyRune}>ᚦ</div>
      <div style={styles.emptyTitle}>The Oracle Awaits</div>
      <div style={styles.emptySubtitle}>
        Ask Mimir anything — concepts, quizzes, summaries, or what to study next.
      </div>
      <div style={styles.emptySuggestions}>
        <div style={styles.suggestion}>"Explain cross-entropy loss"</div>
        <div style={styles.suggestion}>"Quiz me on B+ Trees"</div>
        <div style={styles.suggestion}>"What should I study today?"</div>
        <div style={styles.suggestion}>"Summarize my uploaded notes"</div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  chatArea: {
    flex: 1,
    padding: "12px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
    background: "var(--stone-1)",
  },
  row: {
    display: "flex",
    alignItems: "flex-end",
    gap: 8,
  },
  avatar: {
    width: 24,
    height: 24,
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-header)",
    fontSize: 13,
    color: "var(--green)",
    flexShrink: 0,
  },
  avatarUser: {
    width: 24,
    height: 24,
    background: "var(--stone-4)",
    border: "1px solid var(--gold-dim)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--gold)",
    flexShrink: 0,
  },
  bubble: {
    padding: "8px 12px",
    maxWidth: "75%",
  },
  mimirBubble: {
    background: "var(--stone-3)",
    borderLeft: "2px solid var(--green)",
    border: "1px solid var(--green-dark)",
    borderLeftWidth: 2,
    borderLeftColor: "var(--green)",
  },
  userBubble: {
    background: "var(--stone-4)",
    border: "1px solid var(--gold-dim)",
    borderRightWidth: 2,
    borderRightColor: "var(--gold-dim)",
  },
  sender: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  time: {
    fontFamily: "var(--font-body)",
    fontSize: 8,
    color: "var(--text-dim)",
    fontStyle: "italic",
    textTransform: "none" as const,
  },
  content: {
    fontFamily: "var(--font-body)",
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 32,
    textAlign: "center" as const,
    color: "var(--text-dim)",
  },
  emptyRune: {
    fontFamily: "var(--font-header)",
    fontSize: 48,
    color: "var(--green-dark)",
    lineHeight: 1,
  },
  emptyTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "var(--text-dim)",
  },
  emptySubtitle: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--text-dim)",
    maxWidth: 280,
  },
  emptySuggestions: {
    marginTop: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    width: "100%",
    maxWidth: 320,
  },
  suggestion: {
    padding: "5px 12px",
    background: "var(--stone-2)",
    border: "1px solid var(--green-dark)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    cursor: "default",
  },
};
