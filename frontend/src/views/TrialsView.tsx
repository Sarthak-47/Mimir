/**
 * Trials View — dedicated quiz runner.
 * Subject/topic selector → generate MCQ via /api/quiz/generate → show Quiz.
 */

import { useState } from "react";
import Quiz from "@/components/Quiz";
import type { QuizQuestion } from "@/components/Quiz";
import type { Subject } from "@/App";
import { API_QUIZ as API } from "@/config";

interface TrialsViewProps {
  subjects:      Subject[];
  activeSubject: string | null;
  authToken:     string;
}

type Phase = "setup" | "loading" | "quiz" | "result" | "error";

export default function TrialsView({ subjects, activeSubject, authToken }: TrialsViewProps) {
  const [phase,     setPhase]     = useState<Phase>("setup");
  const [subjectId, setSubjectId] = useState<string>(activeSubject ?? subjects[0]?.id ?? "");
  const [topic,     setTopic]     = useState<string>("");
  const [nQuestions,setNQuestions]= useState<5 | 10 | 15>(5);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [score,     setScore]     = useState<{ got: number; total: number } | null>(null);
  const [errMsg,    setErrMsg]    = useState<string>("");

  const activeSubjectObj = subjects.find((s) => s.id === subjectId);
  const subjectName = activeSubjectObj?.name ?? "";

  const handleBegin = async () => {
    const topicText = topic.trim() || subjectName || "General Knowledge";
    setPhase("loading");
    setErrMsg("");

    try {
      const res = await fetch(`${API}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          topic:   topicText,
          subject: subjectName,
          n:       nQuestions,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Server error ${res.status}`);
      }

      const data = await res.json() as {
        question: string; options: string[]; answer: number; explanation?: string;
      }[];

      if (!data.length) throw new Error("No questions returned.");

      // Map backend response to QuizQuestion shape (add a local id)
      const mapped: QuizQuestion[] = data.map((q, i) => ({
        id:          `q-${i}`,
        question:    q.question,
        options:     q.options,
        answer:      q.answer,
        explanation: q.explanation ?? "",
      }));

      setQuestions(mapped);
      setPhase("quiz");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  const handleComplete = (got: number, total: number) => {
    setScore({ got, total });
    setPhase("result");
  };

  const handleReset = () => {
    setPhase("setup");
    setQuestions([]);
    setScore(null);
    setErrMsg("");
    setTopic("");
  };

  // ── Result card ─────────────────────────────────────────────
  if (phase === "result" && score) {
    const pct = Math.round((score.got / score.total) * 100);
    const msg =
      pct >= 80 ? "Outstanding! You know this well." :
      pct >= 60 ? "Good effort — keep practising." :
      pct >= 40 ? "Needs more work. Review soon." :
                  "Critical weakness. Review in 4 hours.";
    return (
      <div style={styles.wrapper}>
        <div style={styles.resultCard}>
          <div style={styles.resultRune}>ᛏ</div>
          <div style={styles.resultScore}>{score.got}/{score.total} — {pct}%</div>
          <div style={styles.resultMsg}>{msg}</div>
          <div style={styles.engraving} />
          <button style={styles.primaryBtn} onClick={handleReset}>
            Begin Another Trial
          </button>
        </div>
      </div>
    );
  }

  // ── Error card ───────────────────────────────────────────────
  if (phase === "error") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.errorCard}>
          <div style={styles.errorTitle}>The runes could not be consulted</div>
          <div style={styles.errorMsg}>{errMsg}</div>
          <div style={styles.errorHint}>
            Make sure the backend and Ollama are running.
          </div>
          <button style={{ ...styles.primaryBtn, marginTop: 12 }} onClick={handleReset}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz phase ───────────────────────────────────────────────
  if (phase === "quiz") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.quizWrap}>
          <Quiz questions={questions} onComplete={handleComplete} />
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.loading}>
          <div style={styles.loadingRune}>ᛏ</div>
          <div style={styles.loadingText}>Consulting the runes…</div>
        </div>
      </div>
    );
  }

  // ── Setup form ───────────────────────────────────────────────
  return (
    <div style={styles.wrapper}>
      <div style={styles.setupCard}>
        {/* Header */}
        <div style={styles.cardHeader}>
          <span style={styles.headerRune}>ᛏ</span>
          <span style={styles.headerTitle}>Begin Your Trial</span>
        </div>
        <div style={styles.engraving} />

        {/* Subject selector */}
        {subjects.length > 0 && (
          <div style={styles.field}>
            <label style={styles.label}>Discipline</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              style={styles.select}
            >
              <option value="">— any —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Topic input */}
        <div style={styles.field}>
          <label style={styles.label}>
            Topic{subjectName ? ` within ${subjectName}` : ""} (optional)
          </label>
          <input
            style={styles.input}
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={subjectName ? `e.g. "Gradient Descent"` : `e.g. "Binary Search Trees"`}
          />
        </div>

        {/* N selector */}
        <div style={styles.field}>
          <label style={styles.label}>Number of Questions</label>
          <div style={styles.nRow}>
            {([5, 10, 15] as const).map((n) => (
              <button
                key={n}
                style={{ ...styles.nBtn, ...(nQuestions === n ? styles.nBtnActive : {}) }}
                onClick={() => setNQuestions(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.engraving} />

        <button style={styles.primaryBtn} onClick={handleBegin}>
          Enter the Trial — ᛏ
        </button>
        <div style={styles.hint}>
          Requires Ollama to be running with {"{model}"} loaded.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "24px 16px",
    overflowY: "auto",
    background: "var(--stone-1)",
  },
  setupCard: {
    width: "100%",
    maxWidth: 440,
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    padding: "20px 22px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  headerRune: {
    fontFamily: "var(--font-header)",
    fontSize: 16,
    color: "var(--gold)",
  },
  headerTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4,
    margin: "12px 0",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
    marginBottom: 14,
  },
  label: {
    fontFamily: "var(--font-header)",
    fontSize: 7,
    letterSpacing: "0.16em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
  },
  select: {
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "7px 10px",
    outline: "none",
    width: "100%",
  },
  input: {
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "7px 10px",
    outline: "none",
    width: "100%",
  },
  nRow: {
    display: "flex",
    gap: 6,
  },
  nBtn: {
    flex: 1,
    padding: "6px",
    background: "var(--stone-1)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 10,
    cursor: "pointer",
    transition: "all 0.12s",
  },
  nBtnActive: {
    background: "var(--stone-4)",
    borderColor: "var(--green)",
    color: "var(--text-primary)",
  },
  primaryBtn: {
    width: "100%",
    padding: "10px",
    background: "var(--green-dark)",
    border: "1px solid var(--green)",
    color: "var(--green-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 9,
    letterSpacing: "0.14em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  hint: {
    fontFamily: "var(--font-body)",
    fontSize: 9,
    fontStyle: "italic",
    color: "var(--text-dim)",
    textAlign: "center" as const,
    marginTop: 6,
  },
  loading: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: 40,
  },
  loadingRune: {
    fontFamily: "var(--font-header)",
    fontSize: 40,
    color: "var(--gold-dim)",
    animation: "none",
  },
  loadingText: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--text-dim)",
  },
  quizWrap: {
    width: "100%",
    maxWidth: 540,
  },
  resultCard: {
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    padding: "28px 32px",
    textAlign: "center" as const,
    maxWidth: 360,
    width: "100%",
  },
  resultRune: {
    fontFamily: "var(--font-header)",
    fontSize: 36,
    color: "var(--gold)",
    marginBottom: 8,
  },
  resultScore: {
    fontFamily: "var(--font-header)",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--gold-bright)",
    marginBottom: 6,
  },
  resultMsg: {
    fontFamily: "var(--font-body)",
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginBottom: 16,
  },
  errorCard: {
    background: "var(--stone-3)",
    border: "1px solid #5a2020",
    padding: "22px 24px",
    maxWidth: 400,
    width: "100%",
  },
  errorTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.12em",
    color: "#c87a7a",
    marginBottom: 8,
  },
  errorMsg: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "#c87a7a",
    fontStyle: "italic",
    marginBottom: 6,
  },
  errorHint: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    color: "var(--text-dim)",
    fontStyle: "italic",
  },
};
