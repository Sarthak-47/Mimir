/**
 * Trials View — dedicated quiz runner.
 *
 * Supports two modes:
 *   MCQ          — classic multiple-choice (existing behaviour)
 *   Written      — AI-generated question, free-text textarea, LLM marking
 *
 * Both modes persist results to the backend for spaced-repetition tracking.
 */

import { useState, useEffect } from "react";
import Quiz from "@/components/Quiz";
import type { QuizQuestion } from "@/components/Quiz";
import type { Subject } from "@/App";
import { API_QUIZ, API_PROGRESS } from "@/config";

interface TrialsViewProps {
  subjects:          Subject[];
  activeSubject:     string | null;
  authToken:         string;
  /** Pre-fill topic name — set when navigating from the due-today queue. */
  initialTopic?:     string;
  /** Pre-fill subject id — set when navigating from the due-today queue. */
  initialSubjectId?: string;
  /** Called after pre-fill is consumed, so App.tsx can clear the state. */
  onConsumeInitial?: () => void;
}

type TrialMode = "mcq" | "written";
type Phase     = "setup" | "loading" | "quiz" | "written-answer" | "marking" | "result" | "error";

interface WrittenQuestion {
  question:     string;
  answer_guide: string;
  max_marks:    number;
}

interface MarkResult {
  marks_awarded:  number;
  max_marks:      number;
  percentage:     number;
  verdict:        "excellent" | "good" | "partial" | "poor";
  feedback:       string;
  awarded_points: string[];
  missed_points:  string[];
  message:        string;
}

const VERDICT_COLOR: Record<string, string> = {
  excellent: "var(--green-bright)",
  good:      "var(--gold-bright)",
  partial:   "#d4934a",
  poor:      "#c87a7a",
};

export default function TrialsView({ subjects, activeSubject, authToken, initialTopic, initialSubjectId, onConsumeInitial }: TrialsViewProps) {
  const [mode,       setMode]      = useState<TrialMode>("mcq");
  const [phase,      setPhase]     = useState<Phase>("setup");
  const [subjectId,  setSubjectId] = useState<string>(initialSubjectId ?? activeSubject ?? subjects[0]?.id ?? "");
  const [topic,      setTopic]     = useState<string>(initialTopic ?? "");

  // When navigated from due-today queue, consume the pre-fill once
  useEffect(() => {
    if (initialTopic !== undefined || initialSubjectId !== undefined) {
      if (initialTopic)     setTopic(initialTopic);
      if (initialSubjectId) setSubjectId(initialSubjectId);
      onConsumeInitial?.();
    }
  }, [initialTopic, initialSubjectId]);
  const [nQuestions, setNQuestions]= useState<5 | 10 | 15>(5);
  const [questions,  setQuestions] = useState<QuizQuestion[]>([]);
  const [score,      setScore]     = useState<{ got: number; total: number } | null>(null);
  const [errMsg,     setErrMsg]    = useState<string>("");

  // Written mode state
  const [writtenQ,   setWrittenQ]  = useState<WrittenQuestion | null>(null);
  const [userAnswer, setUserAnswer]= useState<string>("");
  const [markResult, setMarkResult]= useState<MarkResult | null>(null);

  const activeSubjectObj = subjects.find((s) => s.id === subjectId);
  const subjectName = activeSubjectObj?.name ?? "";

  // ── Helpers ───────────────────────────────────────────────

  async function resolveTopicId(): Promise<number | null> {
    if (!subjectId || !authToken) return null;
    const subIdNum = parseInt(subjectId, 10);
    if (isNaN(subIdNum)) return null;
    const topicName = topic.trim() || subjectName || "General";

    const topicsRes = await fetch(
      `${API_PROGRESS}/topics?subject_id=${subIdNum}`,
      { headers: { Authorization: `Bearer ${authToken}` } },
    );
    if (!topicsRes.ok) return null;
    const existing = await topicsRes.json() as { id: number; name: string }[];
    const found = existing.find((t) => t.name.toLowerCase() === topicName.toLowerCase());
    if (found) return found.id;

    const createRes = await fetch(`${API_PROGRESS}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ name: topicName, subject_id: subIdNum }),
    });
    if (!createRes.ok) return null;
    const created = await createRes.json() as { id: number };
    return created.id;
  }

  // ── MCQ flow ──────────────────────────────────────────────

  const handleBeginMCQ = async () => {
    const topicText = topic.trim() || subjectName || "General Knowledge";
    setPhase("loading");
    setErrMsg("");
    try {
      const res = await fetch(`${API_QUIZ}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic: topicText, subject: subjectName, n: nQuestions }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const data = await res.json() as {
        question: string; options: string[]; answer: number; explanation?: string;
      }[];
      if (!data.length) throw new Error("No questions returned.");
      setQuestions(data.map((q, i) => ({
        id: `q-${i}`, question: q.question, options: q.options,
        answer: q.answer, explanation: q.explanation ?? "",
      })));
      setPhase("quiz");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  const handleMCQComplete = async (got: number, total: number) => {
    setScore({ got, total });
    setPhase("result");
    try {
      const topicId = await resolveTopicId();
      if (topicId === null) return;
      await fetch(`${API_QUIZ}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic_id: topicId, score: got, total }),
      });
    } catch { /* silent */ }
  };

  // ── Written flow ──────────────────────────────────────────

  const handleBeginWritten = async () => {
    const topicText = topic.trim() || subjectName || "General Knowledge";
    setPhase("loading");
    setErrMsg("");
    try {
      const res = await fetch(`${API_QUIZ}/generate-written`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic: topicText, subject: subjectName }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const q: WrittenQuestion = await res.json();
      setWrittenQ(q);
      setUserAnswer("");
      setPhase("written-answer");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  const handleSubmitWritten = async () => {
    if (!writtenQ || !userAnswer.trim()) return;
    setPhase("marking");
    setErrMsg("");
    try {
      const topicId = await resolveTopicId();
      const res = await fetch(`${API_QUIZ}/mark-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          topic_id:     topicId,   // null → mark-only, no SM-2
          question:     writtenQ.question,
          answer_guide: writtenQ.answer_guide,
          answer:       userAnswer.trim(),
          max_marks:    writtenQ.max_marks,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const r: MarkResult = await res.json();
      setMarkResult(r);
      setPhase("result");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  // ── Reset ─────────────────────────────────────────────────

  const handleReset = () => {
    setPhase("setup");
    setQuestions([]); setScore(null); setErrMsg("");
    setTopic(""); setWrittenQ(null); setUserAnswer(""); setMarkResult(null);
  };

  // ── Render phases ─────────────────────────────────────────

  if (phase === "result") {
    if (mode === "written" && markResult) {
      const vcol = VERDICT_COLOR[markResult.verdict] ?? "var(--text-primary)";
      return (
        <div style={styles.wrapper}>
          <div style={styles.resultCard}>
            <div style={styles.resultRune}>ᛉ</div>
            <div style={{ ...styles.resultScore, color: vcol }}>
              {markResult.marks_awarded}/{markResult.max_marks} — {markResult.percentage}%
            </div>
            <div style={{ ...styles.resultMsg, color: vcol, fontStyle: "normal", marginBottom: 8 }}>
              {markResult.verdict.toUpperCase()}
            </div>
            {markResult.feedback && (
              <div style={styles.writtenFeedback}>{markResult.feedback}</div>
            )}
            {markResult.awarded_points.length > 0 && (
              <div style={styles.pointsBlock}>
                {markResult.awarded_points.map((p, i) => (
                  <div key={i} style={{ ...styles.pointRow, color: "var(--green-bright)" }}>+ {p}</div>
                ))}
              </div>
            )}
            {markResult.missed_points.length > 0 && (
              <div style={styles.pointsBlock}>
                {markResult.missed_points.map((p, i) => (
                  <div key={i} style={{ ...styles.pointRow, color: "#c87a7a" }}>− {p}</div>
                ))}
              </div>
            )}
            <div style={styles.engraving} />
            <div style={styles.resultMsg}>{markResult.message}</div>
            <div style={{ height: 8 }} />
            <button style={styles.primaryBtn} onClick={handleReset}>Begin Another Trial</button>
          </div>
        </div>
      );
    }
    // MCQ result
    if (score) {
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
            <button style={styles.primaryBtn} onClick={handleReset}>Begin Another Trial</button>
          </div>
        </div>
      );
    }
  }

  if (phase === "error") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.errorCard}>
          <div style={styles.errorTitle}>The runes could not be consulted</div>
          <div style={styles.errorMsg}>{errMsg}</div>
          <div style={styles.errorHint}>Make sure the backend and Ollama are running.</div>
          <button style={{ ...styles.primaryBtn, marginTop: 12 }} onClick={handleReset}>Try Again</button>
        </div>
      </div>
    );
  }

  if (phase === "quiz") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.quizWrap}>
          <Quiz questions={questions} onComplete={handleMCQComplete} />
        </div>
      </div>
    );
  }

  if (phase === "loading" || phase === "marking") {
    return (
      <div style={styles.wrapper}>
        <div style={styles.loading}>
          <div style={styles.loadingRune}>{phase === "marking" ? "ᛉ" : "ᛏ"}</div>
          <div style={styles.loadingText}>
            {phase === "marking" ? "The examiner is marking your answer…" : "Consulting the runes…"}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "written-answer" && writtenQ) {
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.setupCard, maxWidth: 560 }}>
          <div style={styles.cardHeader}>
            <span style={styles.headerRune}>ᛉ</span>
            <span style={styles.headerTitle}>Written Trial</span>
          </div>
          <div style={styles.engraving} />

          <div style={styles.writtenQuestion}>{writtenQ.question}</div>
          <div style={styles.writtenHint}>
            Max marks: {writtenQ.max_marks} — write a detailed answer below.
          </div>

          <textarea
            style={styles.writtenTextarea}
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Write your answer here…"
          />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              style={{ ...styles.primaryBtn, flex: 1, opacity: 0.6 }}
              onClick={handleReset}
            >
              Abandon
            </button>
            <button
              style={{
                ...styles.primaryBtn, flex: 2,
                opacity: userAnswer.trim() ? 1 : 0.4,
                cursor:  userAnswer.trim() ? "pointer" : "not-allowed",
              }}
              disabled={!userAnswer.trim()}
              onClick={handleSubmitWritten}
            >
              Submit for Marking — ᛉ
            </button>
          </div>
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

        {/* Mode toggle */}
        <div style={styles.field}>
          <label style={styles.label}>Trial Mode</label>
          <div style={styles.nRow}>
            {(["mcq", "written"] as TrialMode[]).map((m) => (
              <button
                key={m}
                style={{ ...styles.nBtn, ...(mode === m ? styles.nBtnActive : {}) }}
                onClick={() => setMode(m)}
              >
                {m === "mcq" ? "Multiple Choice" : "Written Answer"}
              </button>
            ))}
          </div>
          {mode === "written" && (
            <div style={styles.modeHint}>
              Mimir generates a question. You write a free-text answer. The AI marks it.
            </div>
          )}
        </div>

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
            placeholder=""
          />
        </div>

        {/* N selector — MCQ only */}
        {mode === "mcq" && (
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
        )}

        <div style={styles.engraving} />

        <button
          style={styles.primaryBtn}
          onClick={mode === "mcq" ? handleBeginMCQ : handleBeginWritten}
        >
          {mode === "mcq" ? "Enter the Trial — ᛏ" : "Generate Question — ᛉ"}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1, display: "flex", alignItems: "flex-start",
    justifyContent: "center", padding: "24px 16px",
    overflowY: "auto", background: "transparent",
  },
  setupCard: {
    width: "100%", maxWidth: 440,
    background: "var(--stone-3)", border: "1px solid var(--gold-dim)",
    padding: "20px 22px",
  },
  cardHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  headerRune: { fontFamily: "var(--font-header)", fontSize: 16, color: "var(--gold)" },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 10,
    letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--gold-dim)",
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4, margin: "12px 0",
  },
  field: { display: "flex", flexDirection: "column" as const, gap: 5, marginBottom: 14 },
  label: {
    fontFamily: "var(--font-header)", fontSize: 10,
    letterSpacing: "0.16em", color: "var(--text-secondary)",
    textTransform: "uppercase" as const,
  },
  modeHint: {
    fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic",
    color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5,
  },
  select: {
    background: "var(--stone-1)", border: "1px solid var(--green-dark)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
    fontSize: 13, padding: "7px 10px", outline: "none", width: "100%",
  },
  input: {
    background: "var(--stone-1)", border: "1px solid var(--green-dark)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
    fontSize: 13, padding: "7px 10px", outline: "none", width: "100%",
  },
  nRow: { display: "flex", gap: 6 },
  nBtn: {
    flex: 1, padding: "6px",
    background: "var(--stone-1)", border: "1px solid var(--green-dark)",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 10, cursor: "pointer", transition: "all 0.12s",
  },
  nBtnActive: {
    background: "var(--stone-4)", borderColor: "var(--green)",
    color: "var(--text-primary)",
  },
  primaryBtn: {
    width: "100%", padding: "10px",
    background: "var(--green-dark)", border: "1px solid var(--green)",
    color: "var(--green-bright)", fontFamily: "var(--font-header)",
    fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" as const,
    cursor: "pointer", transition: "all 0.15s",
  },
  loading: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", gap: 12, padding: 40,
  },
  loadingRune: { fontFamily: "var(--font-header)", fontSize: 40, color: "var(--gold-dim)" },
  loadingText: {
    fontFamily: "var(--font-body)", fontSize: 13,
    fontStyle: "italic", color: "var(--text-secondary)",
  },
  quizWrap: { width: "100%", maxWidth: 540 },
  resultCard: {
    background: "var(--stone-3)", border: "1px solid var(--gold-dim)",
    padding: "24px 28px", textAlign: "center" as const,
    maxWidth: 420, width: "100%",
  },
  resultRune: {
    fontFamily: "var(--font-header)", fontSize: 36, color: "var(--gold)", marginBottom: 8,
  },
  resultScore: {
    fontFamily: "var(--font-header)", fontSize: 22, fontWeight: 700,
    color: "var(--gold-bright)", marginBottom: 6,
  },
  resultMsg: {
    fontFamily: "var(--font-body)", fontSize: 13, fontStyle: "italic",
    color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 16,
  },
  writtenFeedback: {
    fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic",
    color: "var(--text-secondary)", lineHeight: 1.6,
    borderLeft: "2px solid var(--gold-dim)", paddingLeft: 10,
    textAlign: "left" as const, marginBottom: 10,
  },
  pointsBlock: {
    display: "flex", flexDirection: "column" as const, gap: 3,
    textAlign: "left" as const, marginBottom: 8,
  },
  pointRow: {
    fontFamily: "var(--font-body)", fontSize: 11, lineHeight: 1.4,
  },
  writtenQuestion: {
    fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
    lineHeight: 1.6, marginBottom: 8, padding: "10px 12px",
    background: "var(--stone-1)", border: "1px solid var(--green-dark)",
  },
  writtenHint: {
    fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic",
    color: "var(--text-dim)", marginBottom: 10,
  },
  writtenTextarea: {
    width: "100%", minHeight: 160,
    background: "var(--stone-1)", border: "1px solid var(--green-dark)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
    fontSize: 13, padding: "8px 10px", outline: "none",
    resize: "vertical" as const, boxSizing: "border-box" as const, lineHeight: 1.6,
  },
  errorCard: {
    background: "var(--stone-3)", border: "1px solid #5a2020",
    padding: "22px 24px", maxWidth: 400, width: "100%",
  },
  errorTitle: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.12em", color: "#c87a7a", marginBottom: 8,
  },
  errorMsg: {
    fontFamily: "var(--font-body)", fontSize: 13, color: "#c87a7a",
    fontStyle: "italic", marginBottom: 6,
  },
  errorHint: {
    fontFamily: "var(--font-body)", fontSize: 11,
    color: "var(--text-dim)", fontStyle: "italic",
  },
};
