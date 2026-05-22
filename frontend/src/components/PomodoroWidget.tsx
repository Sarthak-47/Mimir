/**
 * PomodoroWidget — persistent floating study-session timer.
 *
 * Implements the classic Pomodoro Technique:
 *   - 25 min focus (work) sessions
 *   - 5 min short break after each session
 *   - 15 min long break after every 4 sessions
 *
 * Controls: Start/Pause, Skip (→ next phase), Reset, Close.
 * The widget floats above all other content at the bottom-right of the
 * main area, persisting as the user switches between views.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { notifyDesktop } from "@/utils/notify";

type PomodoroPhase = "focus" | "short-break" | "long-break";

interface PomodoroConfig {
  focus:       number;   // seconds
  shortBreak:  number;
  longBreak:   number;
  longBreakAfter: number;  // work sessions before long break
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focus:          25 * 60,
  shortBreak:      5 * 60,
  longBreak:      15 * 60,
  longBreakAfter:  4,
};

const PHASE_META: Record<PomodoroPhase, { rune: string; label: string; color: string }> = {
  "focus":       { rune: "ᛋ", label: "Focus",        color: "var(--green-bright)" },
  "short-break": { rune: "ᛊ", label: "Short Break",  color: "var(--gold-bright)"  },
  "long-break":  { rune: "ᛁ", label: "Long Break",   color: "var(--gold)"         },
};

interface PomodoroWidgetProps {
  onClose: () => void;
}

export default function PomodoroWidget({ onClose }: PomodoroWidgetProps) {
  const cfg = DEFAULT_CONFIG;

  const [phase,       setPhase]       = useState<PomodoroPhase>("focus");
  const [secsLeft,    setSecsLeft]    = useState(cfg.focus);
  const [running,     setRunning]     = useState(false);
  const [completed,   setCompleted]   = useState(0);   // completed focus sessions today

  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef   = useRef<AudioContext | null>(null);

  // ── Timer helpers ─────────────────────────────────────────

  const totalSecs = phase === "focus" ? cfg.focus : phase === "short-break" ? cfg.shortBreak : cfg.longBreak;
  const progress  = 1 - secsLeft / totalSecs;
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
  const ss = String(secsLeft % 60).padStart(2, "0");
  const meta = PHASE_META[phase];

  const playChime = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch { /* AudioContext unavailable */ }
  }, []);

  const advancePhase = useCallback((currentPhase: PomodoroPhase, currentCompleted: number) => {
    playChime();
    if (currentPhase === "focus") {
      const newCompleted = currentCompleted + 1;
      setCompleted(newCompleted);
      if (newCompleted % cfg.longBreakAfter === 0) {
        setPhase("long-break");
        setSecsLeft(cfg.longBreak);
        notifyDesktop("Pomodoro — Long Break", `Session ${newCompleted} complete. Time for a 15-minute rest.`);
      } else {
        setPhase("short-break");
        setSecsLeft(cfg.shortBreak);
        notifyDesktop("Pomodoro — Short Break", `Session ${newCompleted} complete. Take 5 minutes.`);
      }
    } else {
      setPhase("focus");
      setSecsLeft(cfg.focus);
      notifyDesktop("Pomodoro — Back to Focus", "Break over. Time to sharpen your runes.");
    }
    setRunning(false);
  }, [playChime, cfg]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecsLeft((s) => {
          if (s <= 1) {
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            // Use a functional update + side-effect pattern to read latest phase/completed
            setPhase((p) => { setCompleted((c) => { advancePhase(p, c); return c; }); return p; });
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, advancePhase]);

  const handleSkip = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
    advancePhase(phase, completed);
  };

  const handleReset = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setRunning(false);
    setSecsLeft(totalSecs);
  };

  // ── SVG ring ──────────────────────────────────────────────
  const R = 34;
  const CIRC = 2 * Math.PI * R;
  const dashOffset = CIRC * (1 - progress);

  return (
    <div style={S.widget}>
      {/* Header */}
      <div style={S.header}>
        <span style={{ fontFamily: "var(--font-header)", fontSize: 10, color: meta.color, letterSpacing: "0.14em" }}>
          {meta.rune} {meta.label.toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {completed > 0 && (
            <span style={{ fontFamily: "var(--font-header)", fontSize: 9, color: "var(--text-dim)" }}>
              ᛏ ×{completed}
            </span>
          )}
          <button style={S.closeBtn} onClick={onClose} title="Close timer">×</button>
        </div>
      </div>

      {/* Ring + timer */}
      <div style={S.ringWrap}>
        <svg width={90} height={90} viewBox="0 0 90 90" style={{ display: "block" }}>
          {/* Background ring */}
          <circle cx={45} cy={45} r={R} fill="none" stroke="var(--stone-1)" strokeWidth={5} />
          {/* Progress ring */}
          <circle
            cx={45} cy={45} r={R} fill="none"
            stroke={meta.color} strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 45 45)"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        {/* Time label overlaid on ring */}
        <div style={S.timeOverlay}>
          <span style={{ ...S.timeText, color: meta.color }}>{mm}:{ss}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={S.controls}>
        <button style={S.ctrlBtn} onClick={handleReset} title="Reset">↺</button>
        <button
          style={{ ...S.primaryCtrl, borderColor: meta.color, color: meta.color }}
          onClick={() => setRunning((r) => !r)}
        >
          {running ? "⏸" : "▶"}
        </button>
        <button style={S.ctrlBtn} onClick={handleSkip} title="Skip to next phase">→</button>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  widget: {
    position: "fixed",
    bottom: 20,
    right: "calc(var(--right-panel-width) + 14px)",
    zIndex: 400,
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    padding: "10px 12px 12px",
    width: 130,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
  },
  closeBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", cursor: "pointer",
    fontFamily: "var(--font-header)", fontSize: 14, lineHeight: 1, padding: 0,
  },
  ringWrap: {
    position: "relative",
    width: 90, height: 90,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  timeOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontFamily: "var(--font-header)",
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: "0.04em",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  ctrlBtn: {
    background: "var(--stone-2)",
    border: "1px solid var(--stone-4)",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 13,
    width: 28, height: 28,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
  },
  primaryCtrl: {
    background: "var(--stone-1)",
    border: "1px solid var(--green)",
    color: "var(--green-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 16,
    width: 38, height: 38,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 0,
  },
};
