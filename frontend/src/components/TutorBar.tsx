/**
 * TutorBar — runic 5-step progress chain shown while a tutor session is active.
 *
 * Displays: ᚢ SUMMON → ᛞ WISDOM → ᚾ WORDS → ᛏ BLADES → ᛟ SAGA
 * Gold node = current stage, green = completed, dim = upcoming.
 * Topic name is shown on the left; dismiss (×) button on the right.
 */

interface TutorBarProps {
  topic:     string;
  state:     string;   // INTRO | TEACH | CHECK | QUIZ | DEBRIEF
  onDismiss: () => void;
}

const STAGES = [
  { key: "INTRO",   rune: "ᚢ", label: "SUMMON" },
  { key: "TEACH",   rune: "ᛞ", label: "WISDOM" },
  { key: "CHECK",   rune: "ᚾ", label: "WORDS"  },
  { key: "QUIZ",    rune: "ᛏ", label: "BLADES" },
  { key: "DEBRIEF", rune: "ᛟ", label: "SAGA"   },
] as const;

export default function TutorBar({ topic, state, onDismiss }: TutorBarProps) {
  const currentIdx = STAGES.findIndex((s) => s.key === state);

  return (
    <div style={styles.bar}>
      {/* Topic label */}
      <div style={styles.topic}>
        <span style={styles.topicRune}>ᛚ</span>
        <span style={styles.topicName}>{topic}</span>
      </div>

      {/* Stage chain */}
      <div style={styles.chain}>
        {STAGES.map((stage, i) => {
          const isDone    = i < currentIdx;
          const isCurrent = i === currentIdx;
          const nodeStyle = {
            ...styles.node,
            ...(isCurrent ? styles.nodeCurrent : isDone ? styles.nodeDone : styles.nodeDim),
          };
          return (
            <div key={stage.key} style={styles.stageWrap}>
              {i > 0 && <div style={{ ...styles.connector, ...(isDone ? styles.connectorDone : {}) }} />}
              <div style={nodeStyle} title={stage.label}>
                <span style={styles.nodeRune}>{stage.rune}</span>
                <span style={{ ...styles.nodeLabel, color: isCurrent ? "var(--gold)" : isDone ? "var(--green)" : "var(--text-dim)" }}>
                  {stage.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dismiss */}
      <button style={styles.dismissBtn} onClick={onDismiss} title="End lesson">×</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex", alignItems: "center", gap: 16,
    padding: "5px 14px",
    background: "var(--stone-3)",
    borderBottom: "1px solid var(--gold-dim)",
    flexShrink: 0,
  },
  topic: {
    display: "flex", alignItems: "center", gap: 5,
    flexShrink: 0,
  },
  topicRune: {
    fontFamily: "var(--font-header)", fontSize: 14, color: "var(--gold)",
  },
  topicName: {
    fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em",
    color: "var(--text-secondary)", textTransform: "uppercase" as const,
    maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
  },
  chain: {
    display: "flex", alignItems: "center", flex: 1, justifyContent: "center",
  },
  stageWrap: {
    display: "flex", alignItems: "center",
  },
  connector: {
    width: 24, height: 1,
    background: "var(--stone-4)",
    flexShrink: 0,
  },
  connectorDone: {
    background: "var(--green-dark)",
  },
  node: {
    display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 1,
    padding: "3px 8px",
    border: "1px solid transparent",
    transition: "all 0.2s",
    cursor: "default",
  },
  nodeCurrent: {
    borderColor: "var(--gold-dim)",
    background: "var(--stone-4)",
  },
  nodeDone: {
    borderColor: "var(--green-dark)",
  },
  nodeDim: {
    opacity: 0.35,
  },
  nodeRune: {
    fontFamily: "var(--font-header)", fontSize: 15, lineHeight: 1,
    color: "inherit",
  },
  nodeLabel: {
    fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
  },
  dismissBtn: {
    background: "none", border: "none",
    color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 15,
    cursor: "pointer", lineHeight: 1, padding: "0 0 0 4px", flexShrink: 0,
  },
};
