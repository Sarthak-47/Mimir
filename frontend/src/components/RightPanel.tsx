import type { Subject } from "@/App";

interface RightPanelProps {
  activeSubject?: Subject;
}

// ── Mock data (will come from backend later) ─────────────────
const MOCK_STATS = {
  daysAtWell: 12,
  trialAccuracy: 74,
  streak: 5,
};

const MOCK_WEAKNESSES = [
  { topic: "Loss Functions",   score: 30 },
  { topic: "Markov Chains",    score: 45 },
  { topic: "B+ Trees",         score: 52 },
  { topic: "DP / Graphs",      score: 65 },
];

const MOCK_EXAM = {
  subject:  "Machine Learning",
  daysLeft: 14,
  date:     "May 24",
};

export default function RightPanel({ activeSubject }: RightPanelProps) {
  return (
    <aside style={styles.panel}>
      {/* ── Warrior's Record ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>⟪ Warrior's Record ⟫</div>
        <div style={styles.engraving} />

        <div style={styles.statRow}>
          <div style={styles.stat}>
            <div style={styles.statNumber}>{MOCK_STATS.daysAtWell}</div>
            <div style={styles.statLabel}>Days at Well</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statNumber}>{MOCK_STATS.trialAccuracy}%</div>
            <div style={styles.statLabel}>Trial Acc.</div>
          </div>
        </div>

        <div style={styles.streakRow}>
          <span style={styles.streakIcon}>🔥</span>
          <span style={styles.streakText}>{MOCK_STATS.streak} day streak</span>
        </div>
      </div>

      <div style={styles.engraving} />

      {/* ── Weaknesses ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Weaknesses</div>
        <div style={styles.engraving} />

        {MOCK_WEAKNESSES.map(({ topic, score }) => (
          <div key={topic} style={styles.weaknessItem}>
            <div style={styles.weaknessHeader}>
              <span style={styles.weaknessTopic}>{topic}</span>
              <span style={styles.weaknessScore}>{score}%</span>
            </div>
            <div style={styles.barTrack}>
              <div
                style={{
                  ...styles.barFill,
                  width: `${score}%`,
                  background: score < 40
                    ? "linear-gradient(90deg, #5a1a1a, #8a3a3a)"
                    : score < 60
                    ? "linear-gradient(90deg, var(--gold-dark), var(--gold-dim))"
                    : "linear-gradient(90deg, var(--green-dark), var(--green-dim))",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.engraving} />

      {/* ── Exam Countdown ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Ragnarök Approaches</div>
        <div style={styles.engraving} />

        <div style={styles.countdownNumber}>{MOCK_EXAM.daysLeft}</div>
        <div style={styles.countdownLabel}>Days Until Trial</div>
        <div style={styles.countdownSubject}>
          {MOCK_EXAM.subject} · {MOCK_EXAM.date}
        </div>

        {/* Progress bar */}
        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${100 - Math.min((MOCK_EXAM.daysLeft / 30) * 100, 100)}%`,
              background: "linear-gradient(90deg, var(--gold-dark), var(--gold))",
            }}
          />
        </div>
      </div>

      {/* ── Active subject indicator ── */}
      {activeSubject && (
        <>
          <div style={styles.engraving} />
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Active Discipline</div>
            <div style={styles.activeSubject}>
              <span
                style={{
                  ...styles.diamond,
                  background: activeSubject.color,
                }}
              />
              <span style={styles.activeSubjectName}>{activeSubject.name}</span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: "var(--right-panel-width)",
    minWidth: "var(--right-panel-width)",
    background: "var(--stone-2)",
    borderLeft: "1px solid var(--green-dark)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "100%",
  },
  section: {
    padding: "10px 10px 6px",
  },
  sectionTitle: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.15em",
    textTransform: "uppercase" as const,
    color: "var(--gold-dim)",
    marginBottom: 2,
  },
  engraving: {
    height: 1,
    background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)",
    opacity: 0.35,
    margin: "0 10px",
  },
  statRow: {
    display: "flex",
    gap: 8,
    marginTop: 6,
  },
  stat: {
    flex: 1,
    textAlign: "center" as const,
  },
  statNumber: {
    fontFamily: "var(--font-header)",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--gold-bright)",
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 7,
    letterSpacing: "0.1em",
    color: "var(--text-dim)",
    textTransform: "uppercase" as const,
    marginTop: 2,
  },
  streakRow: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    padding: "3px 6px",
    background: "var(--stone-3)",
    border: "1px solid var(--stone-4)",
  },
  streakIcon: {
    fontSize: 10,
    lineHeight: 1,
  },
  streakText: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  },
  weaknessItem: {
    marginBottom: 6,
  },
  weaknessHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  weaknessTopic: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    color: "var(--text-secondary)",
    lineHeight: 1.3,
  },
  weaknessScore: {
    fontFamily: "var(--font-header)",
    fontSize: 9,
    color: "var(--gold-dim)",
  },
  barTrack: {
    height: 3,
    background: "var(--stone-3)",
    width: "100%",
  },
  barFill: {
    height: "100%",
    transition: "width 0.3s ease",
  },
  countdownNumber: {
    fontFamily: "var(--font-header)",
    fontSize: 36,
    fontWeight: 700,
    color: "var(--gold-bright)",
    lineHeight: 1,
    marginTop: 6,
    textAlign: "center" as const,
  },
  countdownLabel: {
    fontFamily: "var(--font-header)",
    fontSize: 8,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--text-dim)",
    textAlign: "center" as const,
    marginTop: 2,
  },
  countdownSubject: {
    fontFamily: "var(--font-body)",
    fontSize: 10,
    fontStyle: "italic",
    color: "var(--gold-dim)",
    textAlign: "center" as const,
    margin: "4px 0 6px",
  },
  activeSubject: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 5,
    padding: "4px 6px",
    background: "var(--stone-3)",
    border: "1px solid var(--green-dark)",
  },
  diamond: {
    display: "inline-block",
    width: 6,
    height: 6,
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  activeSubjectName: {
    fontFamily: "var(--font-body)",
    fontSize: 11,
    color: "var(--text-primary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
};
