/**
 * SystemStatus — persistent banner for backend/Ollama health issues.
 *
 * Rendered when the /health endpoint returns a "degraded" status. Shows
 * a one-line problem description and the exact terminal command needed to
 * fix it. Auto-dismisses when health recovers (App.tsx polls every 30 s).
 *
 * Returns null when everything is healthy.
 */

export interface HealthStatus {
  status:     "ok" | "degraded";
  ollama_ok:  boolean;
  model_ok:   boolean;
  error:      string | null;
  model:      string;
}

interface SystemStatusProps {
  health: HealthStatus | null;
}

export default function SystemStatus({ health }: SystemStatusProps) {
  if (!health || (health.ollama_ok && health.model_ok)) return null;

  const command = !health.ollama_ok
    ? "ollama serve"
    : `ollama pull ${health.model}`;

  const icon    = !health.ollama_ok ? "ᚠ" : "ᚢ";
  const heading = !health.ollama_ok
    ? "Oracle offline — Ollama is not running"
    : `Rune not found — ${health.model} is not pulled`;

  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      gap:            16,
      padding:        "7px 16px",
      background:     "var(--stone-3)",
      borderBottom:   "1px solid var(--gold-dim)",
      flexShrink:     0,
    }}>
      {/* Left — icon + heading */}
      <span style={{
        fontFamily:    "var(--font-header)",
        fontSize:      11,
        letterSpacing: "0.1em",
        color:         "var(--gold-bright)",
        whiteSpace:    "nowrap",
      }}>
        {icon}&nbsp;&nbsp;{heading}
      </span>

      {/* Right — copy-paste fix command */}
      <code style={{
        fontFamily:    "Consolas, 'Courier New', monospace",
        fontSize:      11,
        color:         "var(--gold-dim)",
        background:    "var(--stone-1)",
        border:        "1px solid var(--stone-5)",
        padding:       "2px 8px",
        whiteSpace:    "nowrap",
        userSelect:    "all",          // click selects the whole command
        cursor:        "text",
        flexShrink:    0,
      }}>
        {command}
      </code>
    </div>
  );
}
