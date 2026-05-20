/**
 * SystemStatus — Norse-themed banner for Ollama health problems.
 *
 * Shown below the Topbar when the 30-second health poll reports that Ollama
 * is unreachable or the configured model has not been pulled yet.
 *
 * Automatically hides when `health` becomes null (all checks pass).
 */

export interface HealthInfo {
  ollama_ok: boolean;
  model_ok:  boolean;
  model:     string;
  error?:    string | null;
}

interface SystemStatusProps {
  health:    HealthInfo;
  onDismiss: () => void;
}

export default function SystemStatus({ health, onDismiss }: SystemStatusProps) {
  const ollamaDown   = !health.ollama_ok;
  const modelMissing = health.ollama_ok && !health.model_ok;

  if (!ollamaDown && !modelMissing) return null;

  const title = ollamaDown
    ? "Ollama is offline — the Oracle cannot speak"
    : `Model "${health.model}" has not been summoned yet`;

  const hint = ollamaDown
    ? "Open a terminal and awaken the daemon:"
    : "Pull the model with:";

  const cmd = ollamaDown
    ? "ollama serve"
    : `ollama pull ${health.model}`;

  return (
    <div style={styles.banner}>
      {/* ── Left: rune + text ── */}
      <div style={styles.left}>
        <span style={styles.rune}>{ollamaDown ? "ᛉ" : "ᚷ"}</span>
        <div style={styles.text}>
          <span style={styles.title}>{title}</span>
          <span style={styles.hint}>{hint}</span>
          <code style={styles.cmd}>{cmd}</code>
        </div>
      </div>

      {/* ── Right: dismiss ── */}
      <button style={styles.close} onClick={onDismiss} title="Dismiss">×</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "rgba(90, 30, 30, 0.55)",
    borderBottom: "1px solid #8a3a3a",
    flexShrink: 0,
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  rune: {
    fontFamily: "var(--font-header)",
    fontSize: 22,
    color: "#e07070",
    flexShrink: 0,
    lineHeight: 1,
  },
  text: {
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap" as const,
    gap: "4px 10px",
  },
  title: {
    fontFamily: "var(--font-header)",
    fontSize: 11,
    letterSpacing: "0.12em",
    color: "#e07070",
    textTransform: "uppercase" as const,
  },
  hint: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    fontStyle: "italic",
    color: "var(--text-dim)",
  },
  cmd: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "var(--gold-dim)",
    background: "var(--stone-3)",
    padding: "1px 6px",
    border: "1px solid var(--green-dark)",
    letterSpacing: "0.05em",
  },
  close: {
    background: "none",
    border: "none",
    color: "#8a3a3a",
    fontFamily: "var(--font-header)",
    fontSize: 16,
    cursor: "pointer",
    padding: "0 0 0 12px",
    lineHeight: 1,
    flexShrink: 0,
    transition: "color 0.15s",
  },
};
