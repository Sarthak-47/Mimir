/**
 * OnboardingWizard — First-launch setup guide for Mimir.
 *
 * Shown as a full-screen overlay the very first time a user opens the app
 * (tracked via `mimir_onboarding_done` in localStorage). Walks through:
 *
 *   Step 1 — Welcome to Mimir
 *   Step 2 — Install Ollama
 *   Step 3 — Pull a model
 *   Step 4 — Set Ragnarök (exam date) — optional
 *   Step 5 — Enter the Well
 *
 * @param authToken      - JWT for health check requests.
 * @param onComplete     - Called when the user clicks "Enter the Well" on step 5.
 * @param onSetExamDate  - Called with the chosen exam date (or null to skip).
 */
import { useState, useCallback } from "react";
import { API_BASE as API } from "@/config";

interface OnboardingWizardProps {
  authToken:     string;
  onComplete:    () => void;
  onSetExamDate: (d: Date | null) => void;
}

type HealthState = "idle" | "checking" | "ok" | "ollama_down" | "model_missing" | "error";

const TOTAL_STEPS = 5;

export default function OnboardingWizard({
  authToken, onComplete, onSetExamDate,
}: OnboardingWizardProps) {
  const [step,        setStep]       = useState(1);
  const [health,      setHealth]     = useState<HealthState>("idle");
  const [modelName,   setModelName]  = useState("qwen2.5:14b");
  const [examInput,   setExamInput]  = useState("");

  // ── Health check (Step 3) ─────────────────────────────────
  const runHealthCheck = useCallback(async () => {
    setHealth("checking");
    try {
      const r = await fetch(`${API}/health`, {
        headers: { Authorization: `Bearer ${authToken}` },
        signal:  AbortSignal.timeout(6000),
      });
      if (!r.ok) { setHealth("error"); return; }
      const data = await r.json() as {
        ollama_ok: boolean; model_ok: boolean; model: string;
      };
      setModelName(data.model ?? "qwen2.5:14b");
      if (!data.ollama_ok)  { setHealth("ollama_down");   return; }
      if (!data.model_ok)   { setHealth("model_missing"); return; }
      setHealth("ok");
    } catch {
      setHealth("error");
    }
  }, [authToken]);

  const advance = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const back    = () => setStep((s) => Math.max(s - 1, 1));

  const handleExamSet = () => {
    if (examInput) {
      onSetExamDate(new Date(examInput + "T00:00:00"));
    }
    advance();
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.panel}>

        {/* ── Header / progress ── */}
        <div style={styles.header}>
          {/* Eye-in-diamond logo mark */}
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
            <path d="M18 2 L34 18 L18 34 L2 18 Z" stroke="#c9a84c" strokeWidth="1.2" fill="none" />
            <line x1="18" y1="2"  x2="18" y2="6"  stroke="#c9a84c" strokeWidth="1" />
            <line x1="34" y1="18" x2="30" y2="18" stroke="#c9a84c" strokeWidth="1" />
            <line x1="18" y1="34" x2="18" y2="30" stroke="#c9a84c" strokeWidth="1" />
            <line x1="2"  y1="18" x2="6"  y2="18" stroke="#c9a84c" strokeWidth="1" />
            <path d="M10 18 Q18 11 26 18 Q18 25 10 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
            <circle cx="18" cy="18" r="3.5" stroke="#c9a84c" strokeWidth="1" fill="none" />
            <circle cx="18" cy="18" r="1.5" fill="#c9a84c" />
          </svg>
          <span style={styles.headerTitle}>MIMIR — First Awakening</span>
          <div style={styles.stepCounter}>{step} / {TOTAL_STEPS}</div>
        </div>

        {/* ── Progress dots ── */}
        <div style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i + 1 <= step
                  ? "var(--gold-bright)"
                  : "var(--stone-4)",
              }}
            />
          ))}
        </div>

        {/* ── Step content ── */}
        <div style={styles.body}>
          {step === 1 && <StepWelcome />}
          {step === 2 && <StepOllama />}
          {step === 3 && <StepModel health={health} modelName={modelName} onCheck={runHealthCheck} />}
          {step === 4 && (
            <StepExamDate
              examInput={examInput}
              onInput={setExamInput}
              onSkip={advance}
            />
          )}
          {step === 5 && <StepDone />}
        </div>

        {/* ── Footer navigation ── */}
        <div style={styles.footer}>
          {step > 1 && step < 5 && (
            <button style={styles.backBtn} onClick={back}>← Back</button>
          )}
          <div style={{ flex: 1 }} />

          {step < 4 && (
            <button
              style={{
                ...styles.nextBtn,
                opacity: step === 3 && health !== "ok" ? 0.4 : 1,
                cursor:  step === 3 && health !== "ok" ? "not-allowed" : "pointer",
              }}
              onClick={advance}
              disabled={step === 3 && health !== "ok"}
            >
              Next →
            </button>
          )}

          {step === 4 && (
            <button style={styles.nextBtn} onClick={handleExamSet}>
              {examInput ? "Set & Continue →" : "Skip →"}
            </button>
          )}

          {step === 5 && (
            <button style={styles.enterBtn} onClick={handleComplete}>
              ᛟ &nbsp;Enter the Well
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step subcomponents ─────────────────────────────────────────

function StepWelcome() {
  return (
    <div style={stepStyles.root}>
      <div style={stepStyles.rune}>ᛟ</div>
      <h2 style={stepStyles.title}>Welcome, Seeker</h2>
      <p style={stepStyles.para}>
        Mimir is your personal study agent — forged to help you learn faster,
        retain longer, and face your exams with the calm of a warrior who has
        already won.
      </p>
      <p style={stepStyles.para}>
        Everything runs on your machine. No data leaves. No accounts. No cloud.
        Just you and the oracle.
      </p>
      <div style={stepStyles.featureList}>
        <FeatureRow rune="ᚦ" text="Ask the Oracle anything across your subjects" />
        <FeatureRow rune="ᛏ" text="Take adaptive quizzes and track mastery over time" />
        <FeatureRow rune="ᛊ" text="Upload scrolls (PDFs) and query them semantically" />
        <FeatureRow rune="ᚢ" text="Track your exam countdown and revision plan" />
        <FeatureRow rune="ᛚ" text="Start guided tutor sessions on any topic" />
      </div>
    </div>
  );
}

function StepOllama() {
  return (
    <div style={stepStyles.root}>
      <div style={stepStyles.rune}>ᚷ</div>
      <h2 style={stepStyles.title}>Install Ollama</h2>
      <p style={stepStyles.para}>
        Mimir speaks through Ollama — a local inference daemon that runs open
        language models on your hardware. It never sends your questions online.
      </p>

      <div style={stepStyles.card}>
        <div style={stepStyles.cardLabel}>1. Download Ollama</div>
        <code style={stepStyles.code}>https://ollama.com/download</code>
        <div style={stepStyles.cardHint}>
          Supports Windows, macOS, and Linux. GPU is ideal but a powerful CPU
          also works — just slower.
        </div>
      </div>

      <div style={stepStyles.card}>
        <div style={stepStyles.cardLabel}>2. Start the daemon</div>
        <code style={stepStyles.code}>ollama serve</code>
        <div style={stepStyles.cardHint}>
          On Windows, the installer adds Ollama to the system tray — it starts
          automatically. On macOS / Linux, run the command above in a terminal.
        </div>
      </div>
    </div>
  );
}

function StepModel({
  health, modelName, onCheck,
}: {
  health: HealthState;
  modelName: string;
  onCheck: () => void;
}) {
  const statusColor = {
    idle:          "var(--text-dim)",
    checking:      "var(--gold-dim)",
    ok:            "var(--green-bright)",
    ollama_down:   "#e07070",
    model_missing: "#e09070",
    error:         "#e07070",
  }[health];

  const statusText = {
    idle:          "Click below to verify your setup.",
    checking:      "Listening to the well…",
    ok:            "All runes aligned. Mimir is ready.",
    ollama_down:   `Ollama is offline. Run: ollama serve`,
    model_missing: `Model "${modelName}" not pulled. Run: ollama pull ${modelName}`,
    error:         "Could not reach the backend. Is Mimir running?",
  }[health];

  return (
    <div style={stepStyles.root}>
      <div style={stepStyles.rune}>ᚱ</div>
      <h2 style={stepStyles.title}>Pull a Model</h2>
      <p style={stepStyles.para}>
        Mimir defaults to <strong style={{ color: "var(--gold-dim)" }}>qwen2.5:14b</strong> — a
        14 B parameter model that balances quality and speed. Pull it with Ollama:
      </p>

      <div style={stepStyles.card}>
        <code style={stepStyles.code}>ollama pull qwen2.5:14b</code>
        <div style={stepStyles.cardHint}>~9 GB download. Runs on GPU or CPU.</div>
      </div>

      <div style={stepStyles.card}>
        <div style={stepStyles.cardLabel}>Smaller / faster alternatives</div>
        <code style={stepStyles.code}>ollama pull qwen2.5:7b</code>
        <code style={{ ...stepStyles.code, marginTop: 4 }}>ollama pull llama3.2:3b</code>
        <div style={stepStyles.cardHint}>Good for integrated graphics or 8 GB RAM.</div>
      </div>

      {/* Status line */}
      <div style={{ ...stepStyles.statusLine, color: statusColor }}>
        {health === "checking" ? "⏳" : health === "ok" ? "✓" : health !== "idle" ? "✕" : "·"}
        {" "}{statusText}
      </div>

      <button style={stepStyles.checkBtn} onClick={onCheck} disabled={health === "checking"}>
        {health === "checking" ? "Checking…" : "Verify Setup"}
      </button>
    </div>
  );
}

function StepExamDate({
  examInput, onInput, onSkip,
}: {
  examInput: string;
  onInput:   (v: string) => void;
  onSkip:    () => void;
}) {
  void onSkip; // consumed by parent footer
  return (
    <div style={stepStyles.root}>
      <div style={stepStyles.rune}>ᚾ</div>
      <h2 style={stepStyles.title}>Set Ragnarök — Your Exam Date</h2>
      <p style={stepStyles.para}>
        Ragnarök is Mimir's name for your exam deadline. Set it and the
        Reckoning view will count down your days, score your readiness, and
        build a revision plan that fits.
      </p>
      <p style={stepStyles.para}>You can skip this and set it later from the sidebar.</p>

      <input
        type="date"
        value={examInput}
        onChange={(e) => onInput(e.target.value)}
        style={stepStyles.dateInput}
      />
    </div>
  );
}

function StepDone() {
  return (
    <div style={{ ...stepStyles.root, alignItems: "center", textAlign: "center" as const }}>
      <div style={{ ...stepStyles.rune, fontSize: 52 }}>ᛟ</div>
      <h2 style={stepStyles.title}>The Well Awaits</h2>
      <p style={stepStyles.para}>
        You are ready. Ask the Oracle anything. Face your Trials.
        Let Mimir guide you toward mastery.
      </p>
      <p style={{ ...stepStyles.para, fontStyle: "italic", color: "var(--gold-dim)" }}>
        "He who drinks from Mimir's well gains wisdom — but pays with what he
        values most."
      </p>
    </div>
  );
}

function FeatureRow({ rune, text }: { rune: string; text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
      <span style={{ fontFamily: "var(--font-header)", fontSize: 16, color: "var(--gold-dim)", width: 20, textAlign: "center" as const, flexShrink: 0 }}>
        {rune}
      </span>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-dim)" }}>
        {text}
      </span>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.82)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 300,
  },
  panel: {
    width: 520,
    maxWidth: "92vw",
    maxHeight: "88vh",
    background: "var(--stone-2)",
    border: "1px solid var(--gold-dim)",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    background: "var(--stone-3)",
    borderBottom: "1px solid var(--green-dark)",
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 12,
    letterSpacing: "0.16em",
    color: "var(--gold-dim)",
    flex: 1,
  },
  stepCounter: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
  },
  dots: {
    display: "flex",
    justifyContent: "center",
    gap: 6,
    padding: "10px 0 0",
    flexShrink: 0,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    transition: "background 0.3s",
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "20px 28px",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 20px",
    borderTop: "1px solid var(--green-dark)",
    background: "var(--stone-3)",
    flexShrink: 0,
  },
  backBtn: {
    background: "none",
    border: "1px solid var(--green-dark)",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.1em",
    cursor: "pointer",
    padding: "6px 12px",
    transition: "all 0.15s",
  },
  nextBtn: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.1em",
    cursor: "pointer",
    padding: "7px 18px",
    transition: "all 0.15s",
  },
  enterBtn: {
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    color: "var(--gold-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 12,
    letterSpacing: "0.12em",
    cursor: "pointer",
    padding: "8px 22px",
    transition: "all 0.15s",
  },
};

const stepStyles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 14,
  },
  rune: {
    fontFamily: "var(--font-header)",
    fontSize: 36,
    color: "var(--gold-bright)",
    lineHeight: 1,
    marginBottom: 2,
  },
  title: {
    fontFamily: "var(--font-header)",
    fontSize: 18,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "var(--text-primary)",
    margin: 0,
  },
  para: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.65,
    margin: 0,
  },
  featureList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    padding: "6px 0",
  },
  card: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    padding: "10px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 5,
  },
  cardLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.14em",
    color: "var(--gold-dim)",
    textTransform: "uppercase" as const,
  },
  cardHint: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
    marginTop: 2,
  },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "var(--text-primary)",
    background: "var(--stone-0)",
    padding: "4px 8px",
    display: "block",
    letterSpacing: "0.04em",
  },
  statusLine: {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    fontStyle: "italic",
    transition: "color 0.3s",
    padding: "2px 0",
  },
  checkBtn: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--green-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.1em",
    cursor: "pointer",
    padding: "7px 18px",
    alignSelf: "flex-start" as const,
    transition: "all 0.15s",
  },
  dateInput: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    padding: "8px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
};
