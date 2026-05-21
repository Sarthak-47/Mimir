/**
 * VoiceRevisionModal — fullscreen overlay for hands-free voice quiz sessions.
 *
 * Loop displayed to the user:
 *   Setup → [Generating] → Speaking question → Listening → [Transcribing]
 *        → [Marking] → Speaking feedback → Between (show result) → repeat / done
 *
 * The modal is rendered by App.tsx when voiceRevisionOpen === true.
 * It closes itself by calling onClose() when the session is done or the
 * user manually exits.
 */

import { useState } from "react";
import useVoiceRevision from "@/hooks/useVoiceRevision";
import type { RevisionPhase } from "@/hooks/useVoiceRevision";
import type { Subject } from "@/App";

interface VoiceRevisionModalProps {
  authToken:     string;
  subjects:      Subject[];
  activeSubject: string | null;
  onClose:       () => void;
}

// ── Phase label + rune displayed in the active card ───────────────────────────
const PHASE_META: Record<RevisionPhase, { label: string; rune: string; pulse?: boolean }> = {
  idle:          { label: "",                   rune: ""    },
  generating:    { label: "Consulting the well…", rune: "ᚦ", pulse: true },
  speaking_q:    { label: "Listen carefully…",  rune: "ᛗ", pulse: true },
  listening:     { label: "Speak your answer",  rune: "ᛉ", pulse: true },
  transcribing:  { label: "Deciphering…",       rune: "ᚱ", pulse: true },
  marking:       { label: "The Oracle judges…", rune: "ᚦ", pulse: true },
  speaking_fb:   { label: "Hear your verdict",  rune: "ᛗ", pulse: true },
  between:       { label: "Result",             rune: "ᛟ"  },
  done:          { label: "Session complete",   rune: "ᚾ"  },
};

const VERDICT_COLOR: Record<string, string> = {
  excellent: "var(--green-bright)",
  good:      "var(--gold-bright)",
  partial:   "#d4934a",
  poor:      "#c87a7a",
};

export default function VoiceRevisionModal({
  authToken,
  subjects,
  activeSubject,
  onClose,
}: VoiceRevisionModalProps) {
  const vr = useVoiceRevision(authToken);

  // Setup form state
  const [setupSubject, setSetupSubject] = useState(activeSubject ?? subjects[0]?.id ?? "");
  const [setupTopic,   setSetupTopic]   = useState("");

  const isActive = vr.phase !== "idle" && vr.phase !== "done";
  const meta     = PHASE_META[vr.phase];

  // Total marks across all results
  const totalGot = vr.results.reduce((s, r) => s + r.marks_awarded, 0);
  const totalMax = vr.results.reduce((s, r) => s + r.max_marks, 0);
  const totalPct = totalMax > 0 ? Math.round((totalGot / totalMax) * 100) : 0;

  const selectedSubject = subjects.find(s => s.id === setupSubject);

  async function handleStart() {
    if (!setupTopic.trim()) return;
    await vr.start(setupTopic.trim(), selectedSubject?.name ?? "");
  }

  function handleClose() {
    if (isActive) vr.endSession();
    onClose();
  }

  return (
    <div style={S.backdrop} onClick={e => { if (e.target === e.currentTarget) handleClose(); }}>
      <div style={S.panel}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={S.header}>
          <span style={S.headerRune}>ᛉ</span>
          <span style={S.headerTitle}>Voice Revision</span>
          <button style={S.closeBtn} onClick={handleClose} title="Close">✕</button>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {vr.error && (
          <div style={S.errorBanner}>
            <span>{vr.error}</span>
            <button style={S.errorDismiss} onClick={vr.clearError}>✕</button>
          </div>
        )}

        {/* ══ SETUP SCREEN ════════════════════════════════════════════════ */}
        {vr.phase === "idle" && (
          <div style={S.body}>
            <p style={S.setupIntro}>
              Mimir will speak a question aloud. When you hear it, answer verbally.
              Your answer is transcribed and marked automatically.
            </p>

            <label style={S.label}>Subject</label>
            <select
              style={S.select}
              value={setupSubject}
              onChange={e => setSetupSubject(e.target.value)}
            >
              {subjects.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <label style={S.label}>Topic</label>
            <input
              style={S.input}
              placeholder="e.g. Newton's Laws of Motion"
              value={setupTopic}
              onChange={e => setSetupTopic(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleStart(); }}
              autoFocus
            />

            <button
              style={{ ...S.primaryBtn, opacity: setupTopic.trim() ? 1 : 0.4 }}
              disabled={!setupTopic.trim()}
              onClick={handleStart}
            >
              ᛉ Begin Voice Trial
            </button>
          </div>
        )}

        {/* ══ ACTIVE SCREEN ═══════════════════════════════════════════════ */}
        {isActive && (
          <div style={S.body}>
            {/* Status indicator */}
            <div style={S.statusRow}>
              <span
                style={{
                  ...S.statusRune,
                  animation: meta.pulse ? "vrPulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                {meta.rune}
              </span>
              <span style={S.statusLabel}>{meta.label}</span>
              <span style={S.qCounter}>Q{vr.qNumber}</span>
            </div>

            {/* Question text */}
            {vr.question && (
              <div style={S.questionBox}>
                <div style={S.questionLabel}>Question</div>
                <div style={S.questionText}>{vr.question.question}</div>
                <div style={S.marksTag}>{vr.question.max_marks} marks</div>
              </div>
            )}

            {/* Transcript — shown after listening */}
            {vr.transcript && (
              <div style={S.transcriptBox}>
                <div style={S.transcriptLabel}>Your answer</div>
                <div style={S.transcriptText}>{vr.transcript}</div>
              </div>
            )}

            {/* Result card — shown during between / speaking_fb */}
            {vr.currentResult && (vr.phase === "between" || vr.phase === "speaking_fb") && (
              <div style={{
                ...S.resultCard,
                borderColor: VERDICT_COLOR[vr.currentResult.verdict] ?? "var(--gold-dim)",
              }}>
                <div style={{ ...S.resultScore, color: VERDICT_COLOR[vr.currentResult.verdict] }}>
                  {vr.currentResult.marks_awarded}/{vr.currentResult.max_marks}
                  <span style={S.resultPct}> — {Math.round(vr.currentResult.percentage)}%</span>
                </div>
                <div style={S.resultFeedback}>{vr.currentResult.feedback}</div>

                {vr.currentResult.missed_points.length > 0 && (
                  <div style={S.pointsList}>
                    <div style={S.pointsTitle}>Missed points</div>
                    {vr.currentResult.missed_points.map((p, i) => (
                      <div key={i} style={S.missedPoint}>✗ {p}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Running score */}
            {vr.results.length > 0 && (
              <div style={S.runningScore}>
                Session: {totalGot}/{totalMax} ({totalPct}%) across {vr.results.length} question{vr.results.length > 1 ? "s" : ""}
              </div>
            )}

            {/* Controls */}
            <div style={S.controls}>
              {vr.phase === "listening" && (
                <button style={S.primaryBtn} onClick={vr.doneListening}>
                  ᛊ Done Speaking
                </button>
              )}
              {vr.phase === "between" && (
                <button style={S.primaryBtn} onClick={vr.nextQuestion}>
                  ᚾ Next Question
                </button>
              )}
              <button style={S.ghostBtn} onClick={vr.endSession}>
                End Session
              </button>
            </div>
          </div>
        )}

        {/* ══ DONE SCREEN ════════════════════════════════════════════════ */}
        {vr.phase === "done" && (
          <div style={S.body}>
            <div style={S.doneHeader}>
              <span style={S.doneRune}>ᚾ</span>
              <span style={S.doneTitle}>Session Complete</span>
            </div>

            <div style={S.summaryRow}>
              <div style={S.summaryItem}>
                <div style={S.summaryValue}>{vr.results.length}</div>
                <div style={S.summaryLabel}>questions</div>
              </div>
              <div style={S.summaryItem}>
                <div style={S.summaryValue}>{totalGot}/{totalMax}</div>
                <div style={S.summaryLabel}>marks</div>
              </div>
              <div style={{
                ...S.summaryItem,
                color: totalPct >= 70 ? "var(--green-bright)" : totalPct >= 50 ? "var(--gold-bright)" : "#c87a7a",
              }}>
                <div style={S.summaryValue}>{totalPct}%</div>
                <div style={S.summaryLabel}>accuracy</div>
              </div>
            </div>

            {/* Per-question breakdown */}
            <div style={S.breakdownList}>
              {vr.results.map((r, i) => (
                <div key={i} style={S.breakdownRow}>
                  <div style={S.breakdownQ}>
                    Q{i + 1}. {r.question.length > 60 ? r.question.slice(0, 60) + "…" : r.question}
                  </div>
                  <div style={{
                    ...S.breakdownScore,
                    color: VERDICT_COLOR[r.verdict] ?? "var(--gold-dim)",
                  }}>
                    {r.marks_awarded}/{r.max_marks}
                  </div>
                </div>
              ))}
            </div>

            <button style={S.primaryBtn} onClick={onClose}>Close</button>
          </div>
        )}
      </div>

      {/* Pulse keyframe injected once */}
      <style>{`
        @keyframes vrPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.55; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 300,
  },
  panel: {
    width: 560, maxWidth: "94vw", maxHeight: "90vh",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    display: "flex", flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "12px 16px",
    background: "var(--stone-3)",
    borderBottom: "1px solid var(--gold-dim)",
    flexShrink: 0,
  },
  headerRune: {
    fontFamily: "var(--font-header)", fontSize: 20, color: "var(--gold-bright)",
  },
  headerTitle: {
    fontFamily: "var(--font-header)", fontSize: 13,
    letterSpacing: "0.12em", color: "var(--text-primary)",
    textTransform: "uppercase", flex: 1,
  },
  closeBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-dim)", fontSize: 14, padding: "2px 6px",
  },
  errorBanner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "8px 16px",
    background: "rgba(200, 80, 80, 0.15)",
    borderBottom: "1px solid rgba(200,80,80,0.4)",
    color: "#e08080", fontSize: 12,
    flexShrink: 0,
  },
  errorDismiss: {
    background: "none", border: "none", cursor: "pointer",
    color: "#e08080", fontSize: 12,
  },
  body: {
    flex: 1, overflowY: "auto",
    padding: 20,
    display: "flex", flexDirection: "column", gap: 14,
  },

  // ── Setup ─────────────────────────────────────────────────────────────────
  setupIntro: {
    fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, margin: 0,
  },
  label: {
    fontSize: 11, color: "var(--gold-dim)",
    fontFamily: "var(--font-header)", letterSpacing: "0.1em",
    textTransform: "uppercase", marginBottom: -8,
  },
  select: {
    background: "var(--stone-3)", border: "1px solid var(--border-dim)",
    color: "var(--text-primary)", padding: "8px 10px", fontSize: 13,
    width: "100%", cursor: "pointer",
  },
  input: {
    background: "var(--stone-3)", border: "1px solid var(--border-dim)",
    color: "var(--text-primary)", padding: "8px 10px", fontSize: 13,
    width: "100%", boxSizing: "border-box" as const,
    outline: "none",
  },

  // ── Active ────────────────────────────────────────────────────────────────
  statusRow: {
    display: "flex", alignItems: "center", gap: 10,
  },
  statusRune: {
    fontFamily: "var(--font-header)", fontSize: 28,
    color: "var(--gold-bright)", display: "inline-block",
  },
  statusLabel: {
    fontSize: 12, color: "var(--text-dim)",
    fontFamily: "var(--font-header)", letterSpacing: "0.1em",
    textTransform: "uppercase", flex: 1,
  },
  qCounter: {
    fontFamily: "var(--font-header)", fontSize: 12,
    color: "var(--gold-dim)", letterSpacing: "0.08em",
  },
  questionBox: {
    background: "var(--stone-3)",
    border: "1px solid var(--border-dim)",
    padding: 14,
    position: "relative" as const,
  },
  questionLabel: {
    fontSize: 10, color: "var(--gold-dim)",
    fontFamily: "var(--font-header)", letterSpacing: "0.12em",
    textTransform: "uppercase", marginBottom: 8,
  },
  questionText: {
    fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6,
  },
  marksTag: {
    position: "absolute" as const, top: 10, right: 12,
    fontSize: 10, color: "var(--gold-dim)",
    fontFamily: "var(--font-header)",
  },
  transcriptBox: {
    background: "rgba(13,40,20,0.6)",
    border: "1px solid var(--green-dark)",
    padding: 12,
  },
  transcriptLabel: {
    fontSize: 10, color: "var(--green-bright)",
    fontFamily: "var(--font-header)", letterSpacing: "0.12em",
    textTransform: "uppercase", marginBottom: 6,
  },
  transcriptText: {
    fontSize: 13, color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.5,
  },
  resultCard: {
    border: "1px solid",
    background: "var(--stone-3)",
    padding: 14,
  },
  resultScore: {
    fontFamily: "var(--font-header)", fontSize: 22,
    marginBottom: 8,
  },
  resultPct: {
    fontSize: 14, color: "var(--text-dim)",
  },
  resultFeedback: {
    fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 8,
  },
  pointsList: {
    marginTop: 6,
  },
  pointsTitle: {
    fontSize: 10, color: "var(--gold-dim)",
    fontFamily: "var(--font-header)", letterSpacing: "0.1em",
    textTransform: "uppercase", marginBottom: 4,
  },
  missedPoint: {
    fontSize: 12, color: "#c87a7a", lineHeight: 1.5,
  },
  runningScore: {
    fontSize: 11, color: "var(--text-dim)", textAlign: "center" as const,
  },
  controls: {
    display: "flex", gap: 10, marginTop: 4,
  },

  // ── Done ──────────────────────────────────────────────────────────────────
  doneHeader: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 4,
  },
  doneRune: {
    fontFamily: "var(--font-header)", fontSize: 32, color: "var(--gold-bright)",
  },
  doneTitle: {
    fontFamily: "var(--font-header)", fontSize: 16,
    letterSpacing: "0.12em", textTransform: "uppercase",
    color: "var(--text-primary)",
  },
  summaryRow: {
    display: "flex", gap: 0,
    border: "1px solid var(--gold-dim)",
  },
  summaryItem: {
    flex: 1, textAlign: "center" as const,
    padding: "14px 0",
    borderRight: "1px solid var(--gold-dim)",
  },
  summaryValue: {
    fontFamily: "var(--font-header)", fontSize: 22,
    color: "var(--gold-bright)", marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 10, color: "var(--text-dim)",
    fontFamily: "var(--font-header)", textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  breakdownList: {
    display: "flex", flexDirection: "column", gap: 8,
    maxHeight: 200, overflowY: "auto",
  },
  breakdownRow: {
    display: "flex", alignItems: "flex-start", gap: 12,
    padding: "8px 10px",
    background: "var(--stone-3)",
    borderLeft: "2px solid var(--border-dim)",
  },
  breakdownQ: {
    flex: 1, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4,
  },
  breakdownScore: {
    fontFamily: "var(--font-header)", fontSize: 13, flexShrink: 0,
  },

  // ── Shared buttons ────────────────────────────────────────────────────────
  primaryBtn: {
    flex: 1,
    background: "var(--gold-dim)",
    border: "1px solid var(--gold-bright)",
    color: "var(--stone-1)",
    padding: "10px 18px",
    fontFamily: "var(--font-header)",
    letterSpacing: "0.1em",
    fontSize: 12,
    textTransform: "uppercase" as const,
    cursor: "pointer",
  },
  ghostBtn: {
    background: "none",
    border: "1px solid var(--border-dim)",
    color: "var(--text-dim)",
    padding: "10px 18px",
    fontFamily: "var(--font-header)",
    letterSpacing: "0.1em",
    fontSize: 12,
    textTransform: "uppercase" as const,
    cursor: "pointer",
  },
};
