import { useState } from "react";

// ── Types ───────────────────────────────────────────────────
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number; // index of correct option
  explanation?: string;
}

interface QuizProps {
  questions: QuizQuestion[];
  onComplete: (score: number, total: number) => void;
}

// ── Component ────────────────────────────────────────────────
export default function Quiz({ questions, onComplete }: QuizProps) {
  const [current, setCurrent]   = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers]   = useState<boolean[]>([]);

  const q = questions[current];
  const isLast = current === questions.length - 1;

  const handleSelect = (idx: number) => {
    if (revealed) return;
    setSelected(idx);
    setRevealed(true);
    setAnswers((prev) => [...prev, idx === q.answer]);
  };

  const handleNext = () => {
    if (isLast) {
      const score = [...answers, selected === q.answer].filter(Boolean).length;
      onComplete(score, questions.length);
    } else {
      setCurrent((c) => c + 1);
      setSelected(null);
      setRevealed(false);
    }
  };

  return (
    <div style={styles.trialCard}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerRune}>ᛏ</span>
        <span style={styles.headerTitle}>TRIAL</span>
        <span style={styles.counter}>{current + 1} / {questions.length}</span>
      </div>

      <div style={styles.engraving} />

      {/* Question */}
      <div style={styles.question}>{q.question}</div>

      {/* Options */}
      <div style={styles.options}>
        {q.options.map((opt, idx) => {
          let variant: "default" | "correct" | "wrong" = "default";
          if (revealed) {
            if (idx === q.answer)       variant = "correct";
            else if (idx === selected)  variant = "wrong";
          }
          return (
            <button
              key={idx}
              style={{
                ...styles.option,
                ...(variant === "correct" ? styles.optionCorrect : {}),
                ...(variant === "wrong"   ? styles.optionWrong   : {}),
                ...(selected === idx && !revealed ? styles.optionSelected : {}),
              }}
              onClick={() => handleSelect(idx)}
              disabled={revealed}
            >
              <span style={styles.optionKey}>{String.fromCharCode(65 + idx)}.</span>
              {opt}
            </button>
          );
        })}
      </div>

      {/* Explanation */}
      {revealed && q.explanation && (
        <div style={styles.explanation}>{q.explanation}</div>
      )}

      {/* Next / Finish */}
      {revealed && (
        <button style={styles.nextBtn} onClick={handleNext}>
          {isLast ? "Complete Trial ᛊ" : "Next ›"}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  trialCard: {
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    padding: 12,
    margin: "8px 0",
    maxWidth: 480,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  headerRune: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    color: "var(--gold)",
  },
  headerTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.15em",
    color: "var(--gold-dim)",
    textTransform: "uppercase" as const,
    flex: 1,
  },
  counter: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    color: "var(--text-dim)",
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 50%, transparent)",
    opacity: 0.4,
    margin: "6px 0",
  },
  question: {
    fontFamily: "var(--font-body)",
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    marginBottom: 10,
  },
  options: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
  },
  option: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "6px 10px",
    background: "var(--stone-2)",
    border: "1px solid var(--green-dark)",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--text-secondary)",
    textAlign: "left" as const,
    width: "100%",
    transition: "all 0.15s",
  },
  optionSelected: {
    background: "var(--stone-4)",
    borderColor: "var(--green)",
    color: "var(--text-primary)",
  },
  optionCorrect: {
    borderColor: "var(--green-bright)",
    color: "var(--green-bright)",
    background: "rgba(106, 184, 122, 0.08)",
    cursor: "default",
  },
  optionWrong: {
    borderColor: "#8a3a3a",
    color: "#c87a7a",
    background: "rgba(138, 58, 58, 0.08)",
    cursor: "default",
  },
  optionKey: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    color: "var(--gold-dim)",
    letterSpacing: "0.08em",
    flexShrink: 0,
    marginTop: 1,
  },
  explanation: {
    marginTop: 10,
    padding: "6px 10px",
    background: "var(--stone-2)",
    borderLeft: "2px solid var(--gold-dim)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  },
  nextBtn: {
    marginTop: 10,
    padding: "6px 16px",
    background: "var(--green-dark)",
    border: "1px solid var(--green)",
    color: "var(--green-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    float: "right" as const,
  },
};
