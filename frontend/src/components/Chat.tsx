import { useEffect, useRef, useState } from "react";
import type { Message } from "@/App";
import Quiz from "@/components/Quiz";
import type { QuizQuestion } from "@/components/Quiz";

// ── Render **bold** as gold highlighted spans ────────────────
function TermHighlight({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} style={{ color: "var(--gold-bright)", fontWeight: 600 }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

interface ChatProps {
  messages: Message[];
}

export default function Chat({ messages }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={styles.chatArea} className="scroll-area">
      {messages.length === 0 && <EmptyState />}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

// ── Single message bubble ────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div
      style={{
        ...styles.row,
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      {!isUser && <div style={styles.avatar}>M</div>}

      <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Text bubble */}
        <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.mimirBubble) }}>
          <div style={styles.sender}>
            {isUser ? "You" : "Mimir"}
            <span style={styles.time}>{formatTime(msg.timestamp)}</span>
          </div>
          <div style={styles.content}>
            {msg.role === "assistant"
              ? <TermHighlight text={msg.content} />
              : msg.content}
          </div>
        </div>

        {/* Inline quiz card (when tool returned MCQs) */}
        {msg.quizData && msg.quizData.length > 0 && (
          <InlineQuiz questions={msg.quizData} />
        )}

        {/* Inline flashcards */}
        {msg.flashcardData && msg.flashcardData.length > 0 && (
          <FlashcardDeck cards={msg.flashcardData} />
        )}
      </div>

      {isUser && <div style={styles.avatarUser}>S</div>}
    </div>
  );
}

// ── Inline quiz ──────────────────────────────────────────────
function InlineQuiz({ questions }: { questions: QuizQuestion[] }) {
  const [score, setScore]       = useState<number | null>(null);
  const [total, setTotal]       = useState<number | null>(null);
  const [finished, setFinished] = useState(false);

  if (finished && score !== null && total !== null) {
    const pct = Math.round((score / total) * 100);
    return (
      <div style={styles.quizResult}>
        <span style={styles.quizResultRune}>ᛏ</span>
        <div>
          <div style={styles.quizResultScore}>{score}/{total} — {pct}%</div>
          <div style={styles.quizResultMsg}>
            {pct >= 80 ? "Outstanding! You know this well." :
             pct >= 60 ? "Good effort — keep practising." :
             pct >= 40 ? "Needs more work. Review soon." :
                         "Critical weakness. Review in 4 hours."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Quiz
      questions={questions}
      onComplete={(s, t) => { setScore(s); setTotal(t); setFinished(true); }}
    />
  );
}

// ── Inline flashcard deck ────────────────────────────────────
function FlashcardDeck({ cards }: { cards: { front: string; back: string }[] }) {
  const [idx, setIdx]       = useState(0);
  const [flipped, setFlip]  = useState(false);

  const card = cards[idx];

  return (
    <div style={styles.flashcard}>
      <div style={styles.flashcardHeader}>
        <span style={{ fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.15em", color: "var(--gold-dim)" }}>
          ᚠ RUNES — {idx + 1}/{cards.length}
        </span>
      </div>
      <div
        style={{ ...styles.flashcardBody, cursor: "pointer" }}
        onClick={() => setFlip((f) => !f)}
      >
        <div style={styles.flashcardText}>
          {flipped ? card.back : card.front}
        </div>
        <div style={styles.flashcardHint}>{flipped ? "Answer" : "Question — click to reveal"}</div>
      </div>
      <div style={styles.flashcardNav}>
        <button style={styles.fcBtn} onClick={() => { setIdx((i) => Math.max(0, i - 1)); setFlip(false); }} disabled={idx === 0}>‹</button>
        <button style={styles.fcBtn} onClick={() => { setIdx((i) => Math.min(cards.length - 1, i + 1)); setFlip(false); }} disabled={idx === cards.length - 1}>›</button>
      </div>
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
        {["Explain cross-entropy loss", "Quiz me on B+ Trees", "What should I study today?", "Summarize my uploaded notes"].map((s) => (
          <div key={s} style={styles.suggestion}>"{s}"</div>
        ))}
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
  chatArea: { flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", background: "var(--stone-1)" },
  row:      { display: "flex", alignItems: "flex-end", gap: 8 },
  avatar:   { width: 26, height: 26, background: "var(--stone-3)", border: "1px solid var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-header)", fontSize: 12, fontWeight: 700, color: "var(--gold)", flexShrink: 0 },
  avatarUser: { width: 26, height: 26, background: "var(--stone-3)", border: "1px solid var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-header)", fontSize: 12, fontWeight: 700, color: "var(--gold)", flexShrink: 0 },
  bubble:   { padding: "8px 12px" },
  mimirBubble: { background: "var(--stone-3)", border: "1px solid var(--green-dark)", borderLeft: "2px solid var(--green)" },
  userBubble:  { background: "var(--stone-4)", border: "1px solid var(--gold-dim)", borderRight: "2px solid var(--gold-dim)" },
  sender:   { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: 4 },
  time:     { fontFamily: "var(--font-body)", fontSize: 8, color: "var(--text-dim)", fontStyle: "italic", textTransform: "none" as const },
  content:  { fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  quizResult: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--stone-3)", border: "1px solid var(--gold-dim)" },
  quizResultRune:  { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold)" },
  quizResultScore: { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, color: "var(--gold-bright)" },
  quizResultMsg:   { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", marginTop: 2 },
  flashcard: { background: "var(--stone-3)", border: "1px solid var(--gold-dim)", padding: 10 },
  flashcardHeader: { marginBottom: 6 },
  flashcardBody:   { background: "var(--stone-2)", border: "1px solid var(--green-dark)", padding: "12px 14px", minHeight: 60 },
  flashcardText:   { fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 },
  flashcardHint:   { fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)", marginTop: 6 },
  flashcardNav:    { display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" },
  fcBtn:           { background: "var(--stone-4)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-header)", fontSize: 13, padding: "2px 10px", cursor: "pointer" },
  emptyState:      { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 32, textAlign: "center" as const },
  emptyRune:       { fontFamily: "var(--font-header)", fontSize: 48, color: "var(--green-dim)", lineHeight: 1 },
  emptyTitle:      { fontFamily: "var(--font-header)", fontSize: 13, fontWeight: 600, letterSpacing: "0.15em", color: "var(--text-secondary)" },
  emptySubtitle:   { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)", maxWidth: 280 },
  emptySuggestions:{ marginTop: 12, display: "flex", flexDirection: "column" as const, gap: 4, width: "100%", maxWidth: 320 },
  suggestion:      { padding: "5px 12px", background: "var(--stone-2)", border: "1px solid var(--green-dim)", fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-primary)" },
};
