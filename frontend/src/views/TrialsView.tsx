/**
 * Trials View — dedicated quiz runner.
 *
 * Supports four modes:
 *   MCQ          — classic multiple-choice (existing behaviour)
 *   Written      — AI-generated question, free-text textarea, LLM marking
 *   Flashcard    — card-flip deck with Easy/Good/Hard/Forgot ratings feeding SM-2
 *   Exam         — timed mock exam: silent answering, full breakdown at the end
 *
 * All modes persist results to the backend for spaced-repetition tracking.
 */

import { useState, useEffect, useRef, useCallback } from "react";
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

type TrialMode = "mcq" | "written" | "flashcard" | "exam";
type Phase     = "setup" | "loading" | "quiz" | "written-answer" | "marking" | "result" | "error" | "flashcard-deck" | "exam-running";

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

interface Flashcard {
  front: string;
  back:  string;
}

// Rating labels & their SM-2 grade values
const RATINGS: { label: string; grade: number; color: string }[] = [
  { label: "Forgot",  grade: 1, color: "#c87a7a" },
  { label: "Hard",    grade: 3, color: "#d4934a" },
  { label: "Good",    grade: 4, color: "var(--gold-bright)" },
  { label: "Easy",    grade: 5, color: "var(--green-bright)" },
];

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

  // Flashcard mode state
  const [flashcards,   setFlashcards]  = useState<Flashcard[]>([]);
  const [cardIndex,    setCardIndex]   = useState(0);
  const [flipped,      setFlipped]     = useState(false);
  const [cardGrades,   setCardGrades]  = useState<number[]>([]);   // grade per card
  const [nCards,       setNCards]      = useState<10 | 15 | 20>(10);

  // Exam mode state
  const [examQuestions,  setExamQuestions]  = useState<QuizQuestion[]>([]);
  const [examAnswers,    setExamAnswers]    = useState<(number | null)[]>([]);  // one per question
  const [examCurrent,    setExamCurrent]    = useState(0);
  const [examTimeLimit,  setExamTimeLimit]  = useState<number>(30);   // minutes; 0 = unlimited
  const [examSecsLeft,   setExamSecsLeft]   = useState(0);
  const [examNQuestions, setExamNQuestions] = useState<10 | 15 | 20>(15);
  const examTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Flashcard flow ────────────────────────────────────────

  const handleBeginFlashcard = async () => {
    const topicText = topic.trim() || subjectName || "General Knowledge";
    setPhase("loading");
    setErrMsg("");
    setCardGrades([]); setCardIndex(0); setFlipped(false);
    try {
      const res = await fetch(`${API_QUIZ}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic: topicText, subject: subjectName, n: nCards }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const data: Flashcard[] = await res.json();
      if (!data.length) throw new Error("No flashcards returned.");
      setFlashcards(data);
      setPhase("flashcard-deck");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  const handleRateCard = async (grade: number) => {
    const newGrades = [...cardGrades, grade];
    setCardGrades(newGrades);

    if (cardIndex >= flashcards.length - 1) {
      // Last card — submit result
      const avgGrade = newGrades.reduce((a, b) => a + b, 0) / newGrades.length;
      setPhase("result");
      try {
        const topicId = await resolveTopicId();
        if (topicId !== null) {
          await fetch(`${API_QUIZ}/flashcard-result`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ topic_id: topicId, avg_grade: avgGrade }),
          });
        }
      } catch { /* silent */ }
    } else {
      setCardIndex((i) => i + 1);
      setFlipped(false);
    }
  };

  // ── Exam flow ─────────────────────────────────────────────

  const handleSubmitExam = useCallback(async (answers: (number | null)[], qs: QuizQuestion[]) => {
    if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
    const got = answers.filter((a, i) => a === qs[i].answer).length;
    setScore({ got, total: qs.length });
    setPhase("result");
    try {
      const topicId = await resolveTopicId();
      if (topicId !== null) {
        await fetch(`${API_QUIZ}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ topic_id: topicId, score: got, total: qs.length }),
        });
      }
    } catch { /* silent */ }
  }, [authToken, topic, subjectId, subjects]);

  const handleBeginExam = async () => {
    const topicText = topic.trim() || subjectName || "General Knowledge";
    setPhase("loading");
    setErrMsg("");
    setExamAnswers([]);
    setExamCurrent(0);
    try {
      const res = await fetch(`${API_QUIZ}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ topic: topicText, subject: subjectName, n: examNQuestions, difficulty: "hard" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { detail?: string }).detail ?? `Server error ${res.status}`);
      }
      const data: QuizQuestion[] = await res.json();
      if (!data.length) throw new Error("No questions returned.");
      setExamQuestions(data);
      setExamAnswers(new Array(data.length).fill(null));
      // Start timer
      if (examTimeLimit > 0) {
        const secs = examTimeLimit * 60;
        setExamSecsLeft(secs);
        if (examTimerRef.current) clearInterval(examTimerRef.current);
        examTimerRef.current = setInterval(() => {
          setExamSecsLeft((s) => {
            if (s <= 1) {
              if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
              // Collect current answers state and force submit
              setExamAnswers((prevAnswers) => {
                setExamQuestions((prevQs) => {
                  void handleSubmitExam(prevAnswers, prevQs);
                  return prevQs;
                });
                return prevAnswers;
              });
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      }
      setPhase("exam-running");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  };

  // ── Reset ─────────────────────────────────────────────────

  const handleReset = () => {
    if (examTimerRef.current) { clearInterval(examTimerRef.current); examTimerRef.current = null; }
    setPhase("setup");
    setQuestions([]); setScore(null); setErrMsg("");
    setTopic(""); setWrittenQ(null); setUserAnswer(""); setMarkResult(null);
    setFlashcards([]); setCardIndex(0); setFlipped(false); setCardGrades([]);
    setExamQuestions([]); setExamAnswers([]); setExamCurrent(0); setExamSecsLeft(0);
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
    // Exam result — detailed per-question breakdown
    if (mode === "exam" && score && examQuestions.length > 0) {
      const pct = Math.round((score.got / score.total) * 100);
      const msg =
        pct >= 80 ? "Outstanding performance. You are exam-ready." :
        pct >= 60 ? "Solid effort — strengthen the weak areas." :
        pct >= 40 ? "More revision needed before the exam." :
                    "Critical gaps. Return to fundamentals.";
      return (
        <div style={{ ...styles.wrapper, alignItems: "flex-start" }}>
          <div style={{ ...styles.resultCard, maxWidth: 560, textAlign: "left" as const }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-header)", fontSize: 30, color: "var(--gold)" }}>ᛞ</div>
              <div>
                <div style={{ fontFamily: "var(--font-header)", fontSize: 20, fontWeight: 700, color: pct >= 60 ? "var(--gold-bright)" : "#c87a7a" }}>
                  {score.got}/{score.total} — {pct}%
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>{msg}</div>
              </div>
            </div>
            <div style={styles.engraving} />

            {/* Per-question breakdown */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "55vh", overflowY: "auto", marginBottom: 14 }}>
              {examQuestions.map((q, qi) => {
                const userAns = examAnswers[qi];
                const correct = userAns === q.answer;
                return (
                  <div key={qi} style={{ background: "var(--stone-1)", border: `1px solid ${correct ? "var(--green-dark)" : "#5a2020"}`, padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-header)", fontSize: 10, color: correct ? "var(--green-bright)" : "#c87a7a", flexShrink: 0, marginTop: 2 }}>
                        {correct ? "✓" : "✗"}
                      </span>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>
                        Q{qi + 1}. {q.question}
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: correct ? "var(--green-bright)" : "#c87a7a", marginLeft: 18 }}>
                      Your answer: {userAns !== null ? q.options[userAns] : "— skipped"}
                    </div>
                    {!correct && (
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--green-bright)", marginLeft: 18 }}>
                        Correct: {q.options[q.answer]}
                      </div>
                    )}
                    {q.explanation && (
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginLeft: 18, marginTop: 4, lineHeight: 1.5 }}>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button style={styles.primaryBtn} onClick={handleReset}>Begin Another Trial</button>
          </div>
        </div>
      );
    }

    // Flashcard result
    if (mode === "flashcard" && cardGrades.length > 0) {
      const avgGrade = cardGrades.reduce((a, b) => a + b, 0) / cardGrades.length;
      const easyCount = cardGrades.filter((g) => g >= 4).length;
      const hardCount = cardGrades.filter((g) => g <= 2).length;
      const pct = Math.round(((avgGrade - 1) / 4) * 100);
      const msg =
        pct >= 80 ? "Excellent recall! You've mastered these runes." :
        pct >= 60 ? "Good work — a few more passes will seal them in." :
        pct >= 40 ? "These runes need drilling. Review again soon." :
                    "The runes elude you. Keep returning to this deck.";
      return (
        <div style={styles.wrapper}>
          <div style={styles.resultCard}>
            <div style={styles.resultRune}>ᚱ</div>
            <div style={styles.resultScore}>{pct}% avg recall</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: "var(--font-header)", fontSize: 11, color: "var(--green-bright)" }}>
                {easyCount} easy
              </span>
              <span style={{ fontFamily: "var(--font-header)", fontSize: 11, color: "#c87a7a" }}>
                {hardCount} hard/forgot
              </span>
            </div>
            <div style={styles.resultMsg}>{msg}</div>
            <div style={styles.engraving} />
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
            {phase === "marking"
              ? "The examiner is marking your answer…"
              : mode === "flashcard"
                ? "Engraving the rune cards…"
                : "Consulting the runes…"}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "flashcard-deck" && flashcards.length > 0) {
    const card = flashcards[cardIndex];
    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.setupCard, maxWidth: 500 }}>
          {/* Header */}
          <div style={styles.cardHeader}>
            <span style={styles.headerRune}>ᚱ</span>
            <span style={styles.headerTitle}>Rune Cards</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-dim)" }}>
              {cardIndex + 1} / {flashcards.length}
            </span>
          </div>
          <div style={styles.engraving} />

          {/* Progress bar */}
          <div style={{ height: 2, background: "var(--stone-1)", marginBottom: 14 }}>
            <div style={{ height: "100%", background: "var(--gold-dim)", width: `${((cardIndex) / flashcards.length) * 100}%`, transition: "width 0.3s" }} />
          </div>

          {/* Card */}
          <div
            style={{
              minHeight: 140, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 8,
              background: "var(--stone-1)", border: flipped ? "1px solid var(--gold-dim)" : "1px solid var(--green-dark)",
              padding: "20px 24px", cursor: flipped ? "default" : "pointer",
              textAlign: "center", transition: "border-color 0.2s",
            }}
            onClick={() => { if (!flipped) setFlipped(true); }}
          >
            {!flipped ? (
              <>
                <div style={{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-dim)", textTransform: "uppercase" }}>
                  FRONT — click to reveal
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)", lineHeight: 1.6 }}>
                  {card.front}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold-dim)", textTransform: "uppercase" }}>
                  BACK
                </div>
                <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>
                  {card.back}
                </div>
              </>
            )}
          </div>

          {/* Rating buttons — shown only after flip */}
          {flipped && (
            <>
              <div style={{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", textAlign: "center", marginTop: 14, textTransform: "uppercase" }}>
                How well did you recall?
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {RATINGS.map(({ label, grade, color }) => (
                  <button
                    key={label}
                    style={{
                      flex: 1, padding: "8px 4px",
                      background: "var(--stone-1)", border: `1px solid ${color}`,
                      color, fontFamily: "var(--font-header)",
                      fontSize: 10, letterSpacing: "0.1em",
                      cursor: "pointer", transition: "background 0.12s",
                      textTransform: "uppercase",
                    }}
                    onClick={() => handleRateCard(grade)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Abandon */}
          <button
            style={{ ...styles.primaryBtn, marginTop: 14, opacity: 0.5, fontSize: 10 }}
            onClick={handleReset}
          >
            Abandon Session
          </button>
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

  // ── Exam running phase ────────────────────────────────────
  if (phase === "exam-running" && examQuestions.length > 0) {
    const eq = examQuestions[examCurrent];
    const mm = String(Math.floor(examSecsLeft / 60)).padStart(2, "0");
    const ss = String(examSecsLeft % 60).padStart(2, "0");
    const timerColor = examSecsLeft > 0 && examSecsLeft < 120 ? "#c87a7a" : "var(--gold-dim)";
    const answered   = examAnswers.filter((a) => a !== null).length;

    return (
      <div style={styles.wrapper}>
        <div style={{ ...styles.setupCard, maxWidth: 560 }}>
          {/* Exam header */}
          <div style={styles.cardHeader}>
            <span style={styles.headerRune}>ᛞ</span>
            <span style={styles.headerTitle}>Mock Exam</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-dim)" }}>
              {answered}/{examQuestions.length} answered
            </span>
            {examTimeLimit > 0 && (
              <span style={{ fontFamily: "var(--font-header)", fontSize: 13, color: timerColor, marginLeft: 10 }}>
                {mm}:{ss}
              </span>
            )}
          </div>
          <div style={styles.engraving} />

          {/* Question counter */}
          <div style={{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-dim)", marginBottom: 10 }}>
            Q{examCurrent + 1} of {examQuestions.length}
          </div>

          {/* Question text */}
          <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6, marginBottom: 12 }}>
            {eq.question}
          </div>

          {/* Options — no feedback, just silent selection */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
            {eq.options.map((opt, oi) => {
              const isSelected = examAnswers[examCurrent] === oi;
              return (
                <button
                  key={oi}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    padding: "7px 10px", width: "100%", textAlign: "left",
                    background: isSelected ? "var(--stone-4)" : "var(--stone-2)",
                    border: isSelected ? "1px solid var(--gold-dim)" : "1px solid var(--green-dark)",
                    color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                    fontFamily: "var(--font-body)", fontSize: 13,
                    cursor: "pointer", outline: "none", transition: "all 0.12s",
                  }}
                  onClick={() => {
                    setExamAnswers((prev) => {
                      const next = [...prev];
                      next[examCurrent] = oi;
                      return next;
                    });
                  }}
                >
                  <span style={{ fontFamily: "var(--font-header)", fontSize: 10, color: "var(--gold-dim)", flexShrink: 0, marginTop: 1 }}>
                    {String.fromCharCode(65 + oi)}.
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Navigation */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{ ...styles.primaryBtn, flex: 1, opacity: examCurrent > 0 ? 0.8 : 0.3 }}
              disabled={examCurrent === 0}
              onClick={() => setExamCurrent((c) => c - 1)}
            >
              ← Prev
            </button>

            {examCurrent < examQuestions.length - 1 ? (
              <button
                style={{ ...styles.primaryBtn, flex: 2 }}
                onClick={() => setExamCurrent((c) => c + 1)}
              >
                Next →
              </button>
            ) : (
              <button
                style={{ ...styles.primaryBtn, flex: 2, background: "var(--gold-dark)", borderColor: "var(--gold)", color: "var(--stone-0)" }}
                onClick={() => handleSubmitExam(examAnswers, examQuestions)}
              >
                Submit Exam ᛞ
              </button>
            )}
          </div>

          {/* Question navigator dots */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
            {examQuestions.map((_, qi) => (
              <button
                key={qi}
                style={{
                  width: 22, height: 22, padding: 0,
                  background: qi === examCurrent ? "var(--gold-dark)" : examAnswers[qi] !== null ? "var(--stone-4)" : "var(--stone-2)",
                  border: qi === examCurrent ? "1px solid var(--gold)" : "1px solid var(--stone-3)",
                  color: qi === examCurrent ? "var(--gold-bright)" : examAnswers[qi] !== null ? "var(--text-secondary)" : "var(--text-dim)",
                  fontFamily: "var(--font-header)", fontSize: 9, cursor: "pointer",
                }}
                onClick={() => setExamCurrent(qi)}
                title={`Q${qi + 1}${examAnswers[qi] !== null ? " (answered)" : ""}`}
              >
                {qi + 1}
              </button>
            ))}
          </div>

          <button style={{ ...styles.primaryBtn, marginTop: 10, opacity: 0.4, fontSize: 10 }} onClick={handleReset}>
            Abandon Exam
          </button>
        </div>
      </div>
    );
  }

  // ── Exam result (detailed breakdown) rendered as part of the main result phase ──
  // handled below alongside MCQ result

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
            {(["mcq", "written", "flashcard", "exam"] as TrialMode[]).map((m) => (
              <button
                key={m}
                style={{ ...styles.nBtn, ...(mode === m ? styles.nBtnActive : {}) }}
                onClick={() => setMode(m)}
              >
                {m === "mcq" ? "MCQ" : m === "written" ? "Written" : m === "flashcard" ? "ᚱ Cards" : "ᛞ Exam"}
              </button>
            ))}
          </div>
          {mode === "written" && (
            <div style={styles.modeHint}>
              Mimir generates a question. You write a free-text answer. The AI marks it.
            </div>
          )}
          {mode === "flashcard" && (
            <div style={styles.modeHint}>
              Flip cards and rate recall (Easy / Good / Hard / Forgot). Updates spaced repetition.
            </div>
          )}
          {mode === "exam" && (
            <div style={styles.modeHint}>
              Timed mock exam — no feedback during. Full breakdown and score at the end.
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

        {/* Card count — Flashcard only */}
        {mode === "flashcard" && (
          <div style={styles.field}>
            <label style={styles.label}>Number of Cards</label>
            <div style={styles.nRow}>
              {([10, 15, 20] as const).map((n) => (
                <button
                  key={n}
                  style={{ ...styles.nBtn, ...(nCards === n ? styles.nBtnActive : {}) }}
                  onClick={() => setNCards(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exam options */}
        {mode === "exam" && (
          <>
            <div style={styles.field}>
              <label style={styles.label}>Number of Questions</label>
              <div style={styles.nRow}>
                {([10, 15, 20] as const).map((n) => (
                  <button
                    key={n}
                    style={{ ...styles.nBtn, ...(examNQuestions === n ? styles.nBtnActive : {}) }}
                    onClick={() => setExamNQuestions(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Time Limit</label>
              <div style={styles.nRow}>
                {[
                  { label: "20 min", value: 20 },
                  { label: "30 min", value: 30 },
                  { label: "45 min", value: 45 },
                  { label: "No limit", value: 0 },
                ].map(({ label, value }) => (
                  <button
                    key={value}
                    style={{ ...styles.nBtn, ...(examTimeLimit === value ? styles.nBtnActive : {}) }}
                    onClick={() => setExamTimeLimit(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div style={styles.engraving} />

        <button
          style={styles.primaryBtn}
          onClick={
            mode === "mcq"       ? handleBeginMCQ :
            mode === "flashcard" ? handleBeginFlashcard :
            mode === "exam"      ? handleBeginExam :
                                   handleBeginWritten
          }
        >
          {mode === "mcq"       ? "Enter the Trial — ᛏ" :
           mode === "flashcard" ? "Draw the Rune Cards — ᚱ" :
           mode === "exam"      ? "Begin Mock Exam — ᛞ" :
                                  "Generate Question — ᛉ"}
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
