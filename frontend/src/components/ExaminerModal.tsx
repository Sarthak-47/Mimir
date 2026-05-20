/**
 * ExaminerModal — AI-powered answer marking overlay.
 *
 * The user provides a question, a mark scheme (key points), their written
 * answer, and the maximum marks available. The backend LLM evaluates the
 * answer and returns marks awarded, a verdict, prose feedback, and lists of
 * earned / missed mark-scheme points.
 *
 * Triggered by the ᛉ examiner button in the Sidebar or Topbar.
 */
import { useState, useCallback } from "react";
import { API_BASE as API } from "@/config";

interface ExaminerModalProps {
  authToken: string;
  onClose:   () => void;
}

interface MarkResult {
  marks_awarded:  number;
  max_marks:      number;
  percentage:     number;
  verdict:        "excellent" | "good" | "partial" | "poor";
  feedback:       string;
  awarded_points: string[];
  missed_points:  string[];
}

type Phase = "input" | "marking" | "result" | "error";

const VERDICT_COLOR: Record<string, string> = {
  excellent: "var(--green-bright)",
  good:      "var(--gold-bright)",
  partial:   "#d4934a",
  poor:      "#c87a7a",
};

const VERDICT_RUNE: Record<string, string> = {
  excellent: "ᚠ",
  good:      "ᛗ",
  partial:   "ᛉ",
  poor:      "ᚷ",
};

export default function ExaminerModal({ authToken, onClose }: ExaminerModalProps) {
  const [phase,      setPhase]      = useState<Phase>("input");
  const [question,   setQuestion]   = useState("");
  const [markScheme, setMarkScheme] = useState("");
  const [answer,     setAnswer]     = useState("");
  const [maxMarks,   setMaxMarks]   = useState(10);
  const [result,     setResult]     = useState<MarkResult | null>(null);
  const [errMsg,     setErrMsg]     = useState("");

  const canSubmit = question.trim() && markScheme.trim() && answer.trim();

  const handleMark = useCallback(async () => {
    if (!canSubmit) return;
    setPhase("marking");
    setErrMsg("");
    try {
      const res = await fetch(`${API}/api/examiner/mark`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          question:    question.trim(),
          mark_scheme: markScheme.trim(),
          answer:      answer.trim(),
          max_marks:   maxMarks,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? `Error ${res.status}`);
      }
      const data: MarkResult = await res.json();
      setResult(data);
      setPhase("result");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Unknown error");
      setPhase("error");
    }
  }, [authToken, question, markScheme, answer, maxMarks, canSubmit]);

  const handleReset = () => {
    setPhase("input");
    setResult(null);
    setErrMsg("");
    setAnswer("");
  };

  return (
    <div
      style={S.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={S.panel}>

        {/* Header */}
        <div style={S.header}>
          <span style={S.headerRune}>ᛉ</span>
          <span style={S.headerTitle}>Examiner — Mark Written Answer</span>
          <button style={S.closeBtn} onClick={onClose} title="Close">×</button>
        </div>
        <div style={S.engraving} />

        {/* Body */}
        <div style={S.body}>

          {/* ── Input phase ── */}
          {(phase === "input" || phase === "error") && (
            <>
              {phase === "error" && (
                <p style={S.errorMsg}>ᚷ &nbsp;{errMsg}</p>
              )}

              {/* Question */}
              <div style={S.field}>
                <label style={S.label}><span style={S.rune}>ᚦ</span> Question</label>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ ...S.textarea, minHeight: 72 }}
                  placeholder="Paste the exam question here…"
                />
              </div>

              {/* Mark scheme */}
              <div style={S.field}>
                <label style={S.label}><span style={S.rune}>ᛊ</span> Mark Scheme / Key Points</label>
                <div style={S.hint}>
                  Each line or bullet = 1 mark. Be concise — the examiner uses these as criteria.
                </div>
                <textarea
                  value={markScheme}
                  onChange={(e) => setMarkScheme(e.target.value)}
                  style={{ ...S.textarea, minHeight: 96 }}
                  placeholder={"• Define the term correctly\n• Give an example\n• Explain the mechanism"}
                />
              </div>

              {/* Max marks */}
              <div style={S.field}>
                <label style={S.label}>
                  <span style={S.rune}>ᛗ</span> Max Marks
                  <span style={S.labelValue}>{maxMarks}</span>
                </label>
                <input
                  type="range"
                  min={2} max={20} step={1}
                  value={maxMarks}
                  onChange={(e) => setMaxMarks(Number(e.target.value))}
                  style={S.range}
                />
                <div style={S.rangeLabels}><span>2</span><span>20</span></div>
              </div>

              {/* Answer */}
              <div style={S.field}>
                <label style={S.label}><span style={S.rune}>ᚢ</span> Your Answer</label>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  style={{ ...S.textarea, minHeight: 120 }}
                  placeholder="Write your answer here…"
                />
              </div>
            </>
          )}

          {/* ── Marking spinner ── */}
          {phase === "marking" && (
            <div style={S.spinner}>
              <div style={S.spinnerRune}>ᛉ</div>
              <div style={S.spinnerText}>The examiner is consulting the runes…</div>
            </div>
          )}

          {/* ── Result ── */}
          {phase === "result" && result && (() => {
            const vcol = VERDICT_COLOR[result.verdict] ?? "var(--text-primary)";
            const vrune = VERDICT_RUNE[result.verdict] ?? "ᛟ";
            return (
              <>
                {/* Score banner */}
                <div style={{ ...S.scoreBanner, borderColor: vcol }}>
                  <span style={{ ...S.scoreRune, color: vcol }}>{vrune}</span>
                  <div style={S.scoreCenter}>
                    <span style={{ ...S.scoreNum, color: vcol }}>
                      {result.marks_awarded} / {result.max_marks}
                    </span>
                    <span style={S.scorePct}>{result.percentage}%</span>
                  </div>
                  <span style={{ ...S.verdictBadge, color: vcol }}>
                    {result.verdict.toUpperCase()}
                  </span>
                </div>

                {/* Prose feedback */}
                {result.feedback && (
                  <div style={S.feedback}>{result.feedback}</div>
                )}

                {/* Awarded points */}
                {result.awarded_points.length > 0 && (
                  <div style={S.pointsBlock}>
                    <div style={S.pointsHeader}>
                      <span style={{ color: "var(--green-bright)" }}>✓</span> Earned
                    </div>
                    {result.awarded_points.map((p, i) => (
                      <div key={i} style={{ ...S.pointRow, color: "var(--green-bright)" }}>
                        <span style={S.pointBullet}>+</span>{p}
                      </div>
                    ))}
                  </div>
                )}

                {/* Missed points */}
                {result.missed_points.length > 0 && (
                  <div style={S.pointsBlock}>
                    <div style={S.pointsHeader}>
                      <span style={{ color: "#c87a7a" }}>✗</span> Missed
                    </div>
                    {result.missed_points.map((p, i) => (
                      <div key={i} style={{ ...S.pointRow, color: "#c87a7a" }}>
                        <span style={S.pointBullet}>−</span>{p}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Footer */}
        <div style={S.engraving} />
        <div style={S.footer}>
          {phase === "result" ? (
            <>
              <button style={S.cancelBtn} onClick={handleReset}>Mark Another</button>
              <button style={S.closeFooterBtn} onClick={onClose}>Close</button>
            </>
          ) : (
            <>
              <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
              <button
                style={{
                  ...S.markBtn,
                  opacity:  (!canSubmit || phase === "marking") ? 0.45 : 1,
                  cursor:   (!canSubmit || phase === "marking") ? "not-allowed" : "pointer",
                }}
                disabled={!canSubmit || phase === "marking"}
                onClick={handleMark}
              >
                {phase === "marking" ? "Marking…" : "ᛉ  Submit for Marking"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200,
  },
  panel: {
    width: 520, maxWidth: "92vw", maxHeight: "88vh",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    display: "flex", flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 16px",
    background: "var(--stone-3)",
    flexShrink: 0,
  },
  headerRune: {
    fontFamily: "var(--font-header)", fontSize: 20,
    color: "var(--gold-bright)", lineHeight: 1, flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: "var(--text-primary)", flex: 1,
  },
  closeBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 18, cursor: "pointer", padding: "0 0 0 8px",
    lineHeight: 1, flexShrink: 0,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4, flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: "auto" as const,
    padding: "14px 18px",
    display: "flex", flexDirection: "column" as const, gap: 14,
  },
  field: {
    display: "flex", flexDirection: "column" as const, gap: 5,
  },
  label: {
    display: "flex", alignItems: "center", gap: 6,
    fontFamily: "var(--font-header)", fontSize: 10,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: "var(--text-primary)",
  },
  rune: {
    color: "var(--gold-dim)", fontSize: 14, lineHeight: 1,
  },
  labelValue: {
    marginLeft: "auto",
    color: "var(--gold-bright)", fontFamily: "var(--font-body)",
    fontSize: 12, fontStyle: "italic", textTransform: "none" as const, letterSpacing: 0,
  },
  hint: {
    fontFamily: "var(--font-body)", fontSize: 10,
    fontStyle: "italic", color: "var(--text-dim)", lineHeight: 1.5,
  },
  textarea: {
    background: "var(--stone-3)", border: "1px solid var(--green-dark)",
    color: "var(--text-primary)", fontFamily: "var(--font-body)",
    fontSize: 12, padding: "7px 9px", outline: "none",
    resize: "vertical" as const, width: "100%",
    boxSizing: "border-box" as const, lineHeight: 1.5,
  },
  range: {
    width: "100%", accentColor: "var(--gold-dim)", cursor: "pointer",
  },
  rangeLabels: {
    display: "flex", justifyContent: "space-between",
    fontFamily: "var(--font-body)", fontSize: 10,
    fontStyle: "italic", color: "var(--text-dim)", marginTop: -4,
  },
  errorMsg: {
    fontFamily: "var(--font-header)", fontSize: 11,
    letterSpacing: "0.1em", color: "#c87a7a", margin: 0,
  },
  spinner: {
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    gap: 12, padding: "32px 0",
  },
  spinnerRune: {
    fontFamily: "var(--font-header)", fontSize: 36,
    color: "var(--gold-dim)",
  },
  spinnerText: {
    fontFamily: "var(--font-body)", fontSize: 12,
    fontStyle: "italic", color: "var(--text-dim)",
  },
  scoreBanner: {
    display: "flex", alignItems: "center", gap: 14,
    padding: "12px 16px",
    background: "var(--stone-3)", border: "1px solid",
  },
  scoreRune: {
    fontFamily: "var(--font-header)", fontSize: 28, lineHeight: 1, flexShrink: 0,
  },
  scoreCenter: {
    flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center",
  },
  scoreNum: {
    fontFamily: "var(--font-header)", fontSize: 26, fontWeight: 700, lineHeight: 1,
  },
  scorePct: {
    fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic",
    color: "var(--text-dim)", marginTop: 3,
  },
  verdictBadge: {
    fontFamily: "var(--font-header)", fontSize: 9,
    letterSpacing: "0.16em", flexShrink: 0,
  },
  feedback: {
    fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic",
    color: "var(--text-secondary)", lineHeight: 1.6,
    borderLeft: "2px solid var(--gold-dim)", paddingLeft: 10,
  },
  pointsBlock: {
    display: "flex", flexDirection: "column" as const, gap: 4,
  },
  pointsHeader: {
    fontFamily: "var(--font-header)", fontSize: 9,
    letterSpacing: "0.14em", textTransform: "uppercase" as const,
    color: "var(--text-dim)", marginBottom: 2,
  },
  pointRow: {
    fontFamily: "var(--font-body)", fontSize: 12,
    display: "flex", gap: 6, alignItems: "flex-start",
  },
  pointBullet: {
    fontFamily: "var(--font-header)", fontSize: 11, flexShrink: 0, marginTop: 1,
  },
  footer: {
    display: "flex", justifyContent: "flex-end",
    alignItems: "center", gap: 10,
    padding: "10px 16px", flexShrink: 0,
  },
  cancelBtn: {
    background: "none", border: "1px solid var(--green-dark)",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 10, letterSpacing: "0.12em", cursor: "pointer",
    padding: "6px 14px", textTransform: "uppercase" as const,
  },
  closeFooterBtn: {
    background: "none", border: "1px solid var(--green-dark)",
    color: "var(--text-dim)", fontFamily: "var(--font-header)",
    fontSize: 10, letterSpacing: "0.12em", cursor: "pointer",
    padding: "6px 14px", textTransform: "uppercase" as const,
  },
  markBtn: {
    background: "var(--stone-3)", border: "1px solid var(--gold-dim)",
    color: "var(--gold-bright)", fontFamily: "var(--font-header)",
    fontSize: 11, letterSpacing: "0.12em",
    padding: "7px 18px", textTransform: "uppercase" as const,
    transition: "all 0.15s",
  },
};
