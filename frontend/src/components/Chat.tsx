import { useEffect, useRef, useState, useCallback } from "react";
import type { Message } from "@/App";
import Quiz from "@/components/Quiz";
import type { QuizQuestion } from "@/components/Quiz";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Render a text segment that may contain `**bold**` spans.
 * Returns an array of React nodes.
 */
function renderBold(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <span key={`${keyPrefix}-b${i}`} style={{ color: "var(--gold-bright)", fontWeight: 600 }}>{part}</span>
      : <span key={`${keyPrefix}-t${i}`}>{part}</span>
  );
}

/**
 * Render a KaTeX formula safely. Returns a span with dangerouslySetInnerHTML
 * on success, or the raw source wrapped in backticks on parse failure.
 */
function KatexSpan({ latex, display, keyVal }: { latex: string; display: boolean; keyVal: string }) {
  try {
    const html = katex.renderToString(latex, { displayMode: display, throwOnError: true });
    return (
      <span
        key={keyVal}
        dangerouslySetInnerHTML={{ __html: html }}
        style={display ? { display: "block", textAlign: "center", margin: "6px 0" } : undefined}
      />
    );
  } catch {
    return <span key={keyVal}>{display ? `$$${latex}$$` : `$${latex}$`}</span>;
  }
}

/**
 * Render assistant message text with LaTeX math and **bold** support.
 *
 * Parse order:
 *   1. Split on $$...$$ (display math blocks)
 *   2. Within each text segment, split on $...$ (inline math)
 *   3. Within each inline text segment, apply **bold** rendering
 */
function MessageRenderer({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];

  // Split on display math $$...$$
  const displayParts = text.split(/\$\$([\s\S]+?)\$\$/g);
  displayParts.forEach((part, di) => {
    if (di % 2 === 1) {
      // display math block
      nodes.push(<KatexSpan key={`d${di}`} latex={part} display={true} keyVal={`d${di}`} />);
    } else {
      // Split on inline math $...$
      const inlineParts = part.split(/\$([^$\n]+?)\$/g);
      inlineParts.forEach((seg, ii) => {
        if (ii % 2 === 1) {
          nodes.push(<KatexSpan key={`d${di}i${ii}`} latex={seg} display={false} keyVal={`d${di}i${ii}`} />);
        } else {
          nodes.push(...renderBold(seg, `d${di}i${ii}`));
        }
      });
    }
  });

  return <>{nodes}</>;
}

const THINKING_PHRASES = [
  "Consulting the Well of Urd",
  "Mimir drinks deep",
  "The runes stir in the dark",
  "Seeking wisdom beneath Yggdrasil",
  "The waters of knowledge churn",
  "The Norns weave their answer",
  "Listening to the world tree",
  "Drawing from the Well's depths",
];

interface ChatProps {
  messages: Message[];
  onSuggestion?: (text: string) => void;
  username?: string;
  isWaiting?: boolean;
}

/**
 * Scrollable chat transcript.
 *
 * Renders user and assistant message bubbles, inline quizzes and flashcard
 * decks (when tool data is attached to a message), and a thinking animation
 * while waiting for the first token. Auto-scrolls to the bottom on new content.
 *
 * @param messages     - Ordered list of messages to display.
 * @param onSuggestion - Called when the user clicks an empty-state suggestion chip.
 * @param username     - Used to derive the user's avatar initial.
 * @param isWaiting    - When true, show the `ThinkingBubble` indicator.
 */
export default function Chat({ messages, onSuggestion, username, isWaiting }: ChatProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isWaiting]);

  return (
    <div style={styles.chatArea} className="scroll-area">
      {messages.length === 0 && <EmptyState onSuggestion={onSuggestion} />}

      {messages.map((msg) => (
        <MessageBubble key={msg.id} msg={msg} username={username} />
      ))}

      {isWaiting && <ThinkingBubble />}

      <div ref={bottomRef} />
    </div>
  );
}

/**
 * Animated "thinking" indicator shown while waiting for the first streaming token.
 *
 * Cycles through Norse-flavoured loading phrases every 2.8 s with a
 * fade-in/out transition between them.
 */
function ThinkingBubble() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [visible, setVisible]     = useState(true);

  const advance = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setPhraseIdx((i) => (i + 1) % THINKING_PHRASES.length);
      setVisible(true);
    }, 350);
  }, []);

  useEffect(() => {
    const id = setInterval(advance, 2800);
    return () => clearInterval(id);
  }, [advance]);

  return (
    <div style={{ ...styles.row, justifyContent: "flex-start" }}>
      <div style={styles.avatar}>M</div>
      <div style={{ ...styles.bubble, ...styles.mimirBubble }}>
        <div style={styles.sender}>Mimir</div>
        <div style={{
          fontFamily:    "var(--font-body)",
          fontSize:      14,
          fontStyle:     "italic",
          color:         "var(--gold-dim)",
          letterSpacing: "0.03em",
          opacity:       visible ? 1 : 0,
          transition:    "opacity 0.35s ease",
          whiteSpace:    "nowrap",
        }}>
          {THINKING_PHRASES[phraseIdx]}…
        </div>
      </div>
    </div>
  );
}

/**
 * Render one chat message bubble with optional inline quiz or flashcard deck.
 *
 * User messages align right; assistant messages align left with the Mimir avatar.
 * If the message carries `quizData` or `flashcardData`, the interactive component
 * is rendered below the text bubble.
 */
function MessageBubble({ msg, username }: { msg: Message; username?: string }) {
  const isUser = msg.role === "user";
  const userInitial = (username?.[0] ?? "?").toUpperCase();

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
              ? <MessageRenderer text={msg.content} />
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

      {isUser && <div style={styles.avatarUser}>{userInitial}</div>}
    </div>
  );
}

/**
 * Inline quiz runner embedded inside a chat message bubble.
 *
 * Wraps the `Quiz` component and replaces it with a score summary card once
 * the user completes all questions. Does not persist the result to the backend
 * (that is handled by `TrialsView` for explicitly started quizzes).
 */
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

/**
 * Flip-card deck embedded inside a chat message bubble.
 *
 * Shows one card at a time. Clicking the card face toggles between question
 * (front) and answer (back). Navigation arrows advance through the deck.
 */
function FlashcardDeck({ cards }: { cards: { front: string; back: string }[] }) {
  const [idx, setIdx]       = useState(0);
  const [flipped, setFlip]  = useState(false);

  const card = cards[idx];

  return (
    <div style={styles.flashcard}>
      <div style={styles.flashcardHeader}>
        <span style={{ fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.15em", color: "var(--gold-dim)" }}>
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

/**
 * Placeholder shown when the message list is empty.
 *
 * Displays a rune, tagline, and four clickable suggestion chips that the user
 * can tap to pre-fill the input with a common starting query.
 */
function EmptyState({ onSuggestion }: { onSuggestion?: (text: string) => void }) {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyRune}>ᚦ</div>
      <div style={styles.emptyTitle}>The Oracle Awaits</div>
      <div style={styles.emptySubtitle}>
        Ask Mimir anything — concepts, quizzes, summaries, or what to study next.
      </div>
      <div style={styles.emptySuggestions}>
        {["Explain cross-entropy loss", "Quiz me on B+ Trees", "What should I study today?", "Summarize my uploaded notes"].map((s) => (
          <button
            key={s}
            style={styles.suggestion}
            onClick={() => onSuggestion?.(s)}
          >
            "{s}"
          </button>
        ))}
      </div>
    </div>
  );
}

/** Format a Date as a locale-aware HH:MM string for message timestamps. */
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
  sender:   { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: 4 },
  time:     { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", fontStyle: "italic", textTransform: "none" as const },
  content:  { fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.65, color: "var(--text-primary)", whiteSpace: "pre-wrap" as const, wordBreak: "break-word" as const },
  quizResult: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--stone-3)", border: "1px solid var(--gold-dim)" },
  quizResultRune:  { fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold)" },
  quizResultScore: { fontFamily: "var(--font-header)", fontSize: 15, fontWeight: 700, color: "var(--gold-bright)" },
  quizResultMsg:   { fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)", marginTop: 2 },
  flashcard: { background: "var(--stone-3)", border: "1px solid var(--gold-dim)", padding: 10 },
  flashcardHeader: { marginBottom: 6 },
  flashcardBody:   { background: "var(--stone-2)", border: "1px solid var(--green-dark)", padding: "12px 14px", minHeight: 60 },
  flashcardText:   { fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)", lineHeight: 1.5 },
  flashcardHint:   { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 6 },
  flashcardNav:    { display: "flex", gap: 4, marginTop: 6, justifyContent: "flex-end" },
  fcBtn:           { background: "var(--stone-4)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-header)", fontSize: 13, padding: "2px 10px", cursor: "pointer" },
  emptyState:      { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 32, textAlign: "center" as const },
  emptyRune:       { fontFamily: "var(--font-header)", fontSize: 52, color: "var(--green-dim)", lineHeight: 1 },
  emptyTitle:      { fontFamily: "var(--font-header)", fontSize: 15, fontWeight: 600, letterSpacing: "0.15em", color: "var(--text-secondary)" },
  emptySubtitle:   { fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic", color: "var(--text-secondary)", maxWidth: 300 },
  emptySuggestions:{ marginTop: 12, display: "flex", flexDirection: "column" as const, gap: 4, width: "100%", maxWidth: 340 },
  suggestion:      { padding: "6px 14px", background: "var(--stone-2)", border: "1px solid var(--green-dim)", fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic", color: "var(--text-primary)", cursor: "pointer", width: "100%", textAlign: "left" as const, transition: "border-color 0.15s, background 0.15s" },
};
