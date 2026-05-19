/**
 * OnboardingWizard — first-launch setup experience.
 *
 * Shown once after a new account is created (or when
 * `mimir_onboarding_done_<username>` is absent from localStorage).
 * Guides the student through five steps before opening the Oracle:
 *
 *  1. WELCOME   — introduce Mimir
 *  2. SUBJECTS  — create at least one study discipline
 *  3. EXAM DATE — set the countdown deadline (optional)
 *  4. SCROLL    — upload a first PDF (optional)
 *  5. READY     — summary + "Enter the Oracle" CTA
 *
 * The overlay sits at z-index 2000, above all other UI.
 */

import { useState, useRef } from "react";
import type { Subject } from "@/App";
import { API_BASE as API, API_FILES } from "@/config";

// ── Props ────────────────────────────────────────────────────
interface Props {
  username:      string;
  authToken:     string;
  subjects:      Subject[];
  onAddSubject:  (name: string) => Promise<void> | void;
  onSetExamDate: (d: Date | null) => void;
  onComplete:    () => void;
}

// ── Step indicator ────────────────────────────────────────────
const STEP_LABELS = ["WELCOME", "SUBJECTS", "RECKONING", "SCROLL", "READY"];

function StepBar({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 36 }}>
      {STEP_LABELS.map((label, i) => (
        <div
          key={label}
          style={{
            flex: 1,
            height: 2,
            background: i <= current ? "var(--gold-dim)" : "var(--stone-5)",
            transition: "background 0.3s",
          }}
          title={label}
        />
      ))}
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────
const heading: React.CSSProperties = {
  fontFamily:    "var(--font-header)",
  fontSize:      22,
  letterSpacing: "0.18em",
  color:         "var(--gold-bright)",
  marginBottom:  8,
};

const sub: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize:   16,
  color:      "var(--text-secondary)",
  lineHeight: 1.7,
  marginBottom: 28,
};

const btn = (primary: boolean): React.CSSProperties => ({
  fontFamily:    "var(--font-header)",
  fontSize:      11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  padding:       "10px 28px",
  background:    primary ? "var(--stone-5)" : "transparent",
  border:        `1px solid ${primary ? "var(--gold-dim)" : "var(--stone-5)"}`,
  color:         primary ? "var(--gold-bright)" : "var(--text-dim)",
  cursor:        "pointer",
});

const inputStyle: React.CSSProperties = {
  width:         "100%",
  background:    "var(--stone-2)",
  border:        "1px solid var(--stone-5)",
  color:         "var(--text-primary)",
  fontFamily:    "var(--font-body)",
  fontSize:      15,
  padding:       "9px 12px",
  outline:       "none",
  marginBottom:  10,
};

// ── Steps ─────────────────────────────────────────────────────

function StepWelcome({ username, onNext }: { username: string; onNext: () => void }) {
  return (
    <>
      <div style={{ fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.3em", color: "var(--gold-dim)", marginBottom: 20 }}>
        ᛟ &nbsp; MIMIR — THE WELL OF KNOWLEDGE
      </div>
      <h1 style={heading}>Hail, {username}.</h1>
      <p style={sub}>
        Mimir is your local study companion — a tutor that lives on your machine,
        remembers what you have studied, and tells you what to focus on next.
        <br /><br />
        Take two minutes to set things up. You can change any of this later.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button style={btn(true)} onClick={onNext}>Begin →</button>
      </div>
    </>
  );
}

function StepSubjects({
  subjects,
  onAddSubject,
  onNext,
  onSkip,
}: {
  subjects: Subject[];
  onAddSubject: (name: string) => Promise<void> | void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [input,   setInput]   = useState("");
  const [adding,  setAdding]  = useState(false);

  const handleAdd = async () => {
    const name = input.trim();
    if (!name) return;
    setAdding(true);
    await onAddSubject(name);
    setInput("");
    setAdding(false);
  };

  return (
    <>
      <h1 style={heading}>ᚷ &nbsp; Add your subjects</h1>
      <p style={sub}>
        Subjects (disciplines) organise your scrolls, quiz scores, and chat
        context. Add as many as you like — e.g. "Mathematics", "Chemistry", "History".
      </p>

      {/* Existing subjects */}
      {subjects.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {subjects.map((s) => (
            <span key={s.id} style={{
              fontFamily:  "var(--font-header)",
              fontSize:    10,
              letterSpacing: "0.1em",
              color:       "var(--gold-bright)",
              background:  "var(--stone-4)",
              border:      "1px solid var(--gold-dim)",
              padding:     "3px 10px",
            }}>
              {s.name}
            </span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          placeholder="Subject name…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          autoFocus
        />
        <button
          style={btn(true)}
          onClick={handleAdd}
          disabled={adding || !input.trim()}
        >
          {adding ? "…" : "Add"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <button style={btn(true)} onClick={onNext} disabled={subjects.length === 0}>
          Continue →
        </button>
        <button style={btn(false)} onClick={onSkip}>Skip</button>
      </div>
    </>
  );
}

function StepExamDate({
  onSetExamDate,
  onNext,
  onSkip,
}: {
  onSetExamDate: (d: Date | null) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [dateVal, setDateVal] = useState("");

  const handleSet = () => {
    if (dateVal) {
      onSetExamDate(new Date(dateVal + "T00:00:00"));
    }
    onNext();
  };

  return (
    <>
      <h1 style={heading}>ᚢ &nbsp; Set your Ragnarök</h1>
      <p style={sub}>
        When is your exam? Mimir will count down the days and calibrate your
        revision plan around it. You can change this any time from the sidebar.
      </p>
      <input
        type="date"
        style={{ ...inputStyle, width: "auto", cursor: "pointer" }}
        value={dateVal}
        onChange={(e) => setDateVal(e.target.value)}
        min={new Date().toISOString().split("T")[0]}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        <button style={btn(true)} onClick={handleSet}>
          {dateVal ? "Set date →" : "No date →"}
        </button>
        <button style={btn(false)} onClick={onSkip}>Skip</button>
      </div>
    </>
  );
}

function StepScroll({
  authToken,
  subjects,
  onNext,
  onSkip,
}: {
  authToken:  string;
  subjects:   Subject[];
  onNext:     () => void;
  onSkip:     () => void;
}) {
  const [uploading,  setUploading]  = useState(false);
  const [uploaded,   setUploaded]   = useState<string | null>(null);
  const [subjectId,  setSubjectId]  = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (subjectId) form.append("subject_id", subjectId);
      const r = await fetch(`${API_FILES}/upload`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body:    form,
      });
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
      setUploaded(file.name);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <h1 style={heading}>ᚱ &nbsp; Upload your first scroll</h1>
      <p style={sub}>
        Drop a PDF — lecture notes, a textbook chapter, a past paper. Mimir will
        read it, chunk it, and make it available in every Oracle conversation.
      </p>

      {subjects.length > 0 && (
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          style={{ ...inputStyle, width: "auto", marginBottom: 14 }}
        >
          <option value="">— assign to subject (optional) —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />

      {uploaded ? (
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--green)",
          marginBottom: 20,
        }}>
          ᛊ &nbsp;{uploaded} uploaded — Mimir will index it in the background.
        </div>
      ) : (
        <button
          style={{ ...btn(true), marginBottom: 20 }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "ᛋ Choose file"}
        </button>
      )}

      {error && (
        <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--gold-dim)", marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button style={btn(true)} onClick={onNext}>
          {uploaded ? "Continue →" : "Skip for now →"}
        </button>
      </div>
    </>
  );
}

function StepReady({
  username,
  subjects,
  onComplete,
}: {
  username:  string;
  subjects:  Subject[];
  onComplete: () => void;
}) {
  return (
    <>
      <div style={{ fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.3em", color: "var(--gold-dim)", marginBottom: 16 }}>
        ᚠ &nbsp; THE WELL IS OPEN
      </div>
      <h1 style={heading}>You are ready, {username}.</h1>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.8, marginBottom: 28 }}>
        {subjects.length > 0 && (
          <div>Subjects: {subjects.map((s) => s.name).join(", ")}</div>
        )}
        <div>Ask anything. The Oracle will explain, quiz, and remember.</div>
        <div>Use <strong style={{ color: "var(--gold-dim)", fontFamily: "var(--font-header)" }}>Ctrl+K</strong> to open the command palette.</div>
      </div>
      <button style={{ ...btn(true), fontSize: 13, padding: "12px 36px" }} onClick={onComplete}>
        ᚦ &nbsp; Enter the Oracle
      </button>
    </>
  );
}

// ── Wizard ────────────────────────────────────────────────────

export default function OnboardingWizard({
  username,
  authToken,
  subjects,
  onAddSubject,
  onSetExamDate,
  onComplete,
}: Props) {
  const [step, setStep] = useState(0);

  const next  = () => setStep((s) => Math.min(s + 1, 4));
  const skip  = () => setStep((s) => Math.min(s + 1, 4));

  return (
    <div style={{
      position:       "fixed",
      inset:          0,
      zIndex:         2000,
      background:     "var(--stone-0)",
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
    }}>
      <div style={{
        width:     560,
        maxWidth:  "90vw",
        padding:   "48px 48px 40px",
        background: "var(--stone-1)",
        border:    "1px solid var(--stone-5)",
        position:  "relative",
      }}>
        {/* Gold engraving at top */}
        <div style={{ height: 1, background: "var(--engraving)", marginBottom: 32 }} />

        <StepBar current={step} />

        {step === 0 && (
          <StepWelcome username={username} onNext={next} />
        )}
        {step === 1 && (
          <StepSubjects
            subjects={subjects}
            onAddSubject={onAddSubject}
            onNext={next}
            onSkip={skip}
          />
        )}
        {step === 2 && (
          <StepExamDate
            onSetExamDate={onSetExamDate}
            onNext={next}
            onSkip={skip}
          />
        )}
        {step === 3 && (
          <StepScroll
            authToken={authToken}
            subjects={subjects}
            onNext={next}
            onSkip={skip}
          />
        )}
        {step === 4 && (
          <StepReady
            username={username}
            subjects={subjects}
            onComplete={onComplete}
          />
        )}

        {/* Gold engraving at bottom */}
        <div style={{ height: 1, background: "var(--engraving)", marginTop: 36 }} />
      </div>
    </div>
  );
}
