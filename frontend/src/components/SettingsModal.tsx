/**
 * SettingsModal — Norse-themed modal overlay for model and inference settings.
 *
 * Triggered by the ᛟ rune button in the Sidebar profile strip (never a nav item).
 * Fetches current settings and available models from the backend on open.
 * PATCHes `/api/system/settings` on save.
 *
 * @param authToken - JWT for authenticated requests.
 * @param onClose   - Called when the modal is dismissed.
 */
import { useState, useEffect, useCallback } from "react";
import { API_BASE as API } from "@/config";

interface ModelInfo {
  name:    string;
  size_gb: number;
}

interface Settings {
  ollama_model:          string;
  ollama_temperature:    number;
  ollama_context_length: number;
}

interface StudyPrefs {
  quiz_count:    number;   // 5 | 10 | 15
  difficulty:    string;   // "easy" | "medium" | "hard"
  pomodoro_focus:  number; // minutes
  pomodoro_short:  number; // minutes
  pomodoro_long:   number; // minutes
}

const PREFS_KEY = "mimir_study_prefs";

function loadPrefs(): StudyPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as StudyPrefs;
  } catch { /* ignore */ }
  return { quiz_count: 5, difficulty: "medium", pomodoro_focus: 25, pomodoro_short: 5, pomodoro_long: 15 };
}

interface SettingsModalProps {
  authToken: string;
  onClose:   () => void;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SettingsModal({ authToken, onClose }: SettingsModalProps) {
  const headers = { Authorization: `Bearer ${authToken}` };

  // ── Remote state ──────────────────────────────────────────
  const [models,    setModels]   = useState<ModelInfo[]>([]);
  const [settings,  setSettings] = useState<Settings | null>(null);
  const [loading,   setLoading]  = useState(true);
  const [fetchErr,  setFetchErr] = useState<string | null>(null);

  // ── Local edits ───────────────────────────────────────────
  const [model,      setModel]      = useState("");
  const [temp,       setTemp]       = useState(0.7);
  const [ctxLen,     setCtxLen]     = useState(8192);
  const [saveState,  setSaveState]  = useState<SaveState>("idle");

  // ── Study preferences (localStorage) ─────────────────────
  const [prefs, setPrefs] = useState<StudyPrefs>(loadPrefs);
  const updatePref = <K extends keyof StudyPrefs>(k: K, v: StudyPrefs[K]) =>
    setPrefs((p) => ({ ...p, [k]: v }));

  // ── Fetch on mount ────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFetchErr(null);

    Promise.all([
      fetch(`${API}/api/system/models`,   { headers }).then((r) => r.json()),
      fetch(`${API}/api/system/settings`, { headers }).then((r) => r.json()),
    ])
      .then(([mods, cfg]: [ModelInfo[], Settings]) => {
        if (!alive) return;
        setModels(Array.isArray(mods) ? mods : []);
        setSettings(cfg);
        setModel(cfg.ollama_model);
        setTemp(cfg.ollama_temperature);
        setCtxLen(cfg.ollama_context_length);
      })
      .catch(() => {
        if (alive) setFetchErr("Could not reach the backend. Is Mimir running?");
      })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaveState("saving");
    // Always persist study prefs to localStorage
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
    try {
      const res = await fetch(`${API}/api/system/settings`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...headers },
        body:    JSON.stringify({
          ollama_model:          model,
          ollama_temperature:    temp,
          ollama_context_length: ctxLen,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated: Settings = await res.json();
      setSettings(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, model, temp, ctxLen, prefs]);

  // ── Dirty check ───────────────────────────────────────────
  const savedPrefs = loadPrefs();
  const isDirty = (settings !== null && (
    model !== settings.ollama_model ||
    temp  !== settings.ollama_temperature ||
    ctxLen !== settings.ollama_context_length
  )) || (
    prefs.quiz_count     !== savedPrefs.quiz_count     ||
    prefs.difficulty     !== savedPrefs.difficulty     ||
    prefs.pomodoro_focus !== savedPrefs.pomodoro_focus ||
    prefs.pomodoro_short !== savedPrefs.pomodoro_short ||
    prefs.pomodoro_long  !== savedPrefs.pomodoro_long
  );

  // ── Render ────────────────────────────────────────────────
  return (
    <div
      style={styles.backdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={styles.panel}>

        {/* ── Header ── */}
        <div style={styles.header}>
          <span style={styles.headerRune}>ᛟ</span>
          <span style={styles.headerTitle}>Forge — Model Settings</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">×</button>
        </div>

        <div style={styles.engraving} />

        {/* ── Body ── */}
        <div style={styles.body}>

          {loading && (
            <p style={styles.status}>Consulting the runes…</p>
          )}

          {!loading && fetchErr && (
            <p style={{ ...styles.status, color: "#e07070" }}>{fetchErr}</p>
          )}

          {!loading && !fetchErr && (
            <>
              {/* Model selector */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᚦ</span> Oracle Model
                </label>
                <div style={styles.hint}>
                  The Ollama model Mimir uses for all reasoning.
                  {models.length === 0
                    ? " No models found — run: ollama pull qwen2.5:14b"
                    : ` ${models.length} model${models.length !== 1 ? "s" : ""} available.`}
                </div>
                {models.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={styles.select}
                  >
                    {/* Current model always in list even if not returned */}
                    {!models.find((m) => m.name === model) && (
                      <option value={model}>{model} (current)</option>
                    )}
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}{m.size_gb > 0 ? ` — ${m.size_gb.toFixed(1)} GB` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={styles.input}
                    placeholder="e.g. qwen2.5:14b"
                  />
                )}
              </div>

              {/* Temperature */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᚢ</span> Temperature
                  <span style={styles.labelValue}>{temp.toFixed(2)}</span>
                </label>
                <div style={styles.hint}>
                  0 = deterministic · 1 = creative. Default: 0.70
                </div>
                <input
                  type="range"
                  min={0} max={1} step={0.01}
                  value={temp}
                  onChange={(e) => setTemp(parseFloat(e.target.value))}
                  style={styles.range}
                />
                <div style={styles.rangeLabels}>
                  <span>0 — precise</span>
                  <span>1 — inspired</span>
                </div>
              </div>

              {/* Context length */}
              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᛊ</span> Context Length
                  <span style={styles.labelValue}>{ctxLen.toLocaleString()} tokens</span>
                </label>
                <div style={styles.hint}>
                  How much conversation the model holds in memory. Higher = more RAM.
                  Range: 512 – 32 768.
                </div>
                <input
                  type="number"
                  min={512} max={32768} step={512}
                  value={ctxLen}
                  onChange={(e) => setCtxLen(Math.max(512, Math.min(32768, Number(e.target.value))))}
                  style={styles.input}
                />
              </div>

              {/* ── Study Preferences ── */}
              <div style={{ height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, transparent)", opacity: 0.35 }} />

              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᛏ</span> Default Quiz Length
                  <span style={styles.labelValue}>{prefs.quiz_count} questions</span>
                </label>
                <div style={styles.hint}>Used as default when opening the Trials view.</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([5, 10, 15] as const).map((n) => (
                    <button
                      key={n}
                      style={{
                        flex: 1, padding: "5px",
                        background: prefs.quiz_count === n ? "var(--stone-4)" : "var(--stone-3)",
                        border: prefs.quiz_count === n ? "1px solid var(--green)" : "1px solid var(--green-dark)",
                        color: prefs.quiz_count === n ? "var(--text-primary)" : "var(--text-dim)",
                        fontFamily: "var(--font-header)", fontSize: 10, cursor: "pointer",
                      }}
                      onClick={() => updatePref("quiz_count", n)}
                    >{n}</button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᚢ</span> Default Difficulty
                  <span style={styles.labelValue}>{prefs.difficulty}</span>
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button
                      key={d}
                      style={{
                        flex: 1, padding: "5px",
                        background: prefs.difficulty === d ? "var(--stone-4)" : "var(--stone-3)",
                        border: prefs.difficulty === d ? "1px solid var(--green)" : "1px solid var(--green-dark)",
                        color: prefs.difficulty === d ? "var(--text-primary)" : "var(--text-dim)",
                        fontFamily: "var(--font-header)", fontSize: 10, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.08em",
                      }}
                      onClick={() => updatePref("difficulty", d)}
                    >{d}</button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  <span style={styles.labelRune}>ᛋ</span> Pomodoro Durations (minutes)
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  {([
                    { key: "pomodoro_focus" as const,  label: "Focus",        options: [20, 25, 30, 45] },
                    { key: "pomodoro_short" as const,  label: "Short Break",  options: [3, 5, 10] },
                    { key: "pomodoro_long"  as const,  label: "Long Break",   options: [10, 15, 20] },
                  ]).map(({ key, label, options }) => (
                    <div key={key}>
                      <div style={{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>
                      <select
                        style={{ ...styles.select, fontSize: 11 }}
                        value={prefs[key]}
                        onChange={(e) => updatePref(key, parseInt(e.target.value, 10))}
                      >
                        {options.map((o) => <option key={o} value={o}>{o} min</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save feedback */}
              {saveState === "error" && (
                <p style={{ ...styles.feedback, color: "#e07070" }}>
                  ᛉ &nbsp;Failed to save — check the backend log.
                </p>
              )}
              {saveState === "saved" && (
                <p style={{ ...styles.feedback, color: "var(--green-bright)" }}>
                  ᛟ &nbsp;Settings engraved into the stone.
                </p>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {!loading && !fetchErr && (
          <>
            <div style={styles.engraving} />
            <div style={styles.footer}>
              <button style={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button
                style={{
                  ...styles.saveBtn,
                  opacity: (!isDirty || saveState === "saving") ? 0.5 : 1,
                  cursor:  (!isDirty || saveState === "saving") ? "not-allowed" : "pointer",
                }}
                onClick={handleSave}
                disabled={!isDirty || saveState === "saving"}
              >
                {saveState === "saving" ? "Saving…" : "ᛟ  Engrave Settings"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 200,
  },
  panel: {
    width: 460,
    maxWidth: "90vw",
    maxHeight: "85vh",
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
    flexShrink: 0,
  },
  headerRune: {
    fontFamily: "var(--font-header)",
    fontSize: 20,
    color: "var(--gold-bright)",
    lineHeight: 1,
    flexShrink: 0,
  },
  headerTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 13,
    letterSpacing: "0.12em",
    color: "var(--text-primary)",
    flex: 1,
    textTransform: "uppercase" as const,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 0 0 8px",
    lineHeight: 1,
    transition: "color 0.15s",
    flexShrink: 0,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 40%, var(--gold-dim) 60%, transparent)",
    opacity: 0.4,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 20,
  },
  status: {
    fontFamily: "var(--font-body)",
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--text-dim)",
    textAlign: "center" as const,
    margin: "20px 0",
  },
  field: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
  },
  label: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.14em",
    color: "var(--text-primary)",
    textTransform: "uppercase" as const,
  },
  labelRune: {
    color: "var(--gold-dim)",
    fontSize: 15,
    lineHeight: 1,
    flexShrink: 0,
  },
  labelValue: {
    marginLeft: "auto",
    color: "var(--gold-bright)",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    textTransform: "none" as const,
    letterSpacing: 0,
    fontStyle: "italic",
  },
  hint: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
    lineHeight: 1.5,
  },
  select: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "6px 8px",
    outline: "none",
    cursor: "pointer",
    width: "100%",
  },
  input: {
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    padding: "6px 8px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  range: {
    width: "100%",
    accentColor: "var(--green-bright)",
    cursor: "pointer",
  },
  rangeLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "var(--font-body)",
    fontSize: 10,
    fontStyle: "italic",
    color: "var(--text-dim)",
    marginTop: -4,
  },
  feedback: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.1em",
    margin: 0,
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    flexShrink: 0,
  },
  cancelBtn: {
    background: "none",
    border: "1px solid var(--green-dark)",
    color: "var(--text-dim)",
    fontFamily: "var(--font-header)",
    fontSize: 10,
    letterSpacing: "0.12em",
    cursor: "pointer",
    padding: "6px 14px",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
  },
  saveBtn: {
    background: "var(--stone-3)",
    border: "1px solid var(--gold-dim)",
    color: "var(--gold-bright)",
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.12em",
    padding: "7px 18px",
    textTransform: "uppercase" as const,
    transition: "all 0.15s",
  },
};
