/**
 * SettingsView — runtime configuration panel.
 *
 * Lets the user switch the active Ollama model, adjust temperature, and
 * change the context window length without editing .env files.
 * Changes are sent to PATCH /api/system/settings and persisted by the backend
 * to DATA_DIR/user_settings.json so they survive app restarts.
 */

import { useState, useEffect } from "react";
import { API_BASE as API } from "@/config";

interface Props {
  authToken: string | null;
}

interface SystemSettings {
  ollama_model:          string;
  ollama_temperature:    number;
  ollama_context_length: number;
  ollama_base_url:       string;
}

// ── Inline styles helpers ────────────────────────────────────
const label: React.CSSProperties = {
  fontFamily:    "var(--font-header)",
  fontSize:      11,
  letterSpacing: "0.15em",
  color:         "var(--text-secondary)",
  textTransform: "uppercase",
  marginBottom:  6,
  display:       "block",
};

const hint: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize:   13,
  color:      "var(--text-dim)",
  marginTop:  4,
};

const selectStyle: React.CSSProperties = {
  width:         "100%",
  background:    "var(--stone-2)",
  border:        "1px solid var(--stone-5)",
  color:         "var(--text-primary)",
  fontFamily:    "Consolas, 'Courier New', monospace",
  fontSize:      13,
  padding:       "7px 10px",
  cursor:        "pointer",
  appearance:    "none",
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: "120px",
};

// ── Component ────────────────────────────────────────────────

export default function SettingsView({ authToken }: Props) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [current, setCurrent]   = useState<SystemSettings | null>(null);
  const [model,   setModel]     = useState("");
  const [temp,    setTemp]      = useState(0.7);
  const [ctx,     setCtx]       = useState(8192);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  const headers = {
    "Content-Type":  "application/json",
    Authorization:   `Bearer ${authToken}`,
  };

  // Load current settings + available models on mount
  useEffect(() => {
    if (!authToken) return;

    Promise.all([
      fetch(`${API}/api/system/settings`, { headers }).then((r) => r.json()),
      fetch(`${API}/api/system/models`,   { headers }).then((r) => r.json()),
    ]).then(([settingsData, modelsData]) => {
      const s = settingsData as SystemSettings;
      setCurrent(s);
      setModel(s.ollama_model);
      setTemp(s.ollama_temperature);
      setCtx(s.ollama_context_length);
      setAvailableModels((modelsData as { models: string[] }).models ?? []);
    }).catch(() => setError("Could not load settings — is the backend running?"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const handleSave = async () => {
    if (!authToken) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const r = await fetch(`${API}/api/system/settings`, {
        method:  "PATCH",
        headers,
        body: JSON.stringify({
          ollama_model:          model,
          ollama_temperature:    temp,
          ollama_context_length: ctx,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json() as SystemSettings;
      setCurrent(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const dirty = current
    ? (model !== current.ollama_model ||
       Math.abs(temp - current.ollama_temperature) > 0.001 ||
       ctx !== current.ollama_context_length)
    : false;

  return (
    <div style={{
      flex:      1,
      overflowY: "auto",
      padding:   "32px 40px",
      maxWidth:  640,
    }}>
      {/* ── Header ── */}
      <h1 style={{
        fontFamily:    "var(--font-header)",
        fontSize:      20,
        letterSpacing: "0.15em",
        color:         "var(--gold-bright)",
        marginBottom:  4,
      }}>
        ᛟ &nbsp; Settings
      </h1>
      <div style={{ height: 1, background: "var(--engraving)", margin: "10px 0 28px" }} />

      {error && (
        <div style={{
          padding:      "10px 14px",
          background:   "var(--stone-4)",
          border:       "1px solid var(--gold-dim)",
          color:        "var(--gold-bright)",
          fontFamily:   "var(--font-body)",
          fontSize:     13,
          marginBottom: 24,
        }}>
          {error}
        </div>
      )}

      {/* ── Model ── */}
      <section style={{ marginBottom: 28 }}>
        <label style={label}>Active Model</label>
        {availableModels.length > 0 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={selectStyle}
          >
            {availableModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            style={{ ...selectStyle }}
            placeholder="e.g. qwen2.5:14b"
          />
        )}
        <p style={hint}>
          {availableModels.length > 0
            ? `${availableModels.length} model${availableModels.length !== 1 ? "s" : ""} available in Ollama`
            : "Ollama not reachable — type a model name manually"}
        </p>
      </section>

      {/* ── Temperature ── */}
      <section style={{ marginBottom: 28 }}>
        <label style={label}>Temperature — {temp.toFixed(2)}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temp}
            onChange={(e) => setTemp(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "var(--gold)" }}
          />
          <span style={{
            fontFamily: "Consolas, monospace",
            fontSize:   13,
            color:      "var(--gold-dim)",
            minWidth:   36,
          }}>
            {temp.toFixed(2)}
          </span>
        </div>
        <p style={hint}>
          Lower = more focused and deterministic. Higher = more creative and varied.
          Default: 0.70
        </p>
      </section>

      {/* ── Context length ── */}
      <section style={{ marginBottom: 36 }}>
        <label style={label}>Context Length (tokens)</label>
        <input
          type="number"
          min={512}
          max={32768}
          step={512}
          value={ctx}
          onChange={(e) => setCtx(Math.max(512, Math.min(32768, parseInt(e.target.value) || 512)))}
          style={inputStyle}
        />
        <p style={hint}>
          How many tokens the model can see per request. Higher = more context but slower
          and more VRAM. Default: 8192. Maximum your model supports may be lower.
        </p>
      </section>

      {/* ── Read-only info ── */}
      {current && (
        <section style={{ marginBottom: 36 }}>
          <label style={label}>Ollama endpoint</label>
          <code style={{
            fontFamily: "Consolas, 'Courier New', monospace",
            fontSize:   12,
            color:      "var(--text-dim)",
          }}>
            {current.ollama_base_url}
          </code>
          <p style={{ ...hint, marginTop: 6 }}>
            Change via OLLAMA_BASE_URL in the .env file or environment variable.
          </p>
        </section>
      )}

      {/* ── Save button ── */}
      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        style={{
          fontFamily:    "var(--font-header)",
          fontSize:      12,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          padding:       "9px 28px",
          background:    dirty ? "var(--stone-5)" : "var(--stone-2)",
          border:        `1px solid ${dirty ? "var(--gold-dim)" : "var(--stone-4)"}`,
          color:         dirty ? "var(--gold-bright)" : "var(--text-dim)",
          cursor:        dirty && !saving ? "pointer" : "default",
          transition:    "all 0.15s",
        }}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
      </button>

      {saved && (
        <p style={{ ...hint, marginTop: 10, color: "var(--green)" }}>
          Settings saved — new model and parameters will be used for the next Oracle message.
        </p>
      )}
    </div>
  );
}
