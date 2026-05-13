import { useEffect, useState } from "react";
import type { Subject } from "@/App";

// ── API base ─────────────────────────────────────────────────
const API = "http://localhost:8000/api/progress";

// ── Types ────────────────────────────────────────────────────
interface Stats {
  days_at_well:    number;
  trial_accuracy:  number;
  streak:          number;
  total_quizzes:   number;
}

interface Weakness {
  topic:  string;
  score:  number;
  status: "critical" | "weak" | "moderate" | "strong";
}

interface RightPanelProps {
  activeSubject?: Subject;
}

// ── Helpers ──────────────────────────────────────────────────
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

// ── Component ────────────────────────────────────────────────
export default function RightPanel({ activeSubject }: RightPanelProps) {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [s, w] = await Promise.all([
          fetchJson<Stats>(`${API}/stats`),
          fetchJson<Weakness[]>(`${API}/weaknesses`),
        ]);
        if (!cancelled) { setStats(s); setWeaknesses(w); }
      } catch {
        // Backend not running yet — silently keep null state
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    // Refresh every 30 s
    const timer = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // ── Fallback values when backend is offline ───────────────
  const daysAtWell   = stats?.days_at_well   ?? "—";
  const accuracy     = stats?.trial_accuracy != null ? `${stats.trial_accuracy}%` : "—";
  const streak       = stats?.streak         ?? 0;
  const weakList     = weaknesses.slice(0, 4);

  // Exam countdown — derive from activeSubject (future: fetch from user settings)
  const examDays   = 14;
  const examLabel  = activeSubject ? `${activeSubject.name} · Soon` : "No exam set";

  return (
    <aside style={styles.panel}>

      {/* ── Warrior's Record ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>⟪ Warrior's Record ⟫</div>
        <div style={styles.engraving} />

        <div style={styles.statRow}>
          <div style={styles.stat}>
            <div style={styles.statNumber}>{loading ? "…" : daysAtWell}</div>
            <div style={styles.statLabel}>Days at Well</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statNumber}>{loading ? "…" : accuracy}</div>
            <div style={styles.statLabel}>Trial Acc.</div>
          </div>
        </div>

        {streak > 0 && (
          <div style={styles.streakRow}>
            <span style={styles.streakIcon}>🔥</span>
            <span style={styles.streakText}>{streak} day streak</span>
          </div>
        )}
      </div>

      <div style={styles.engraving} />

      {/* ── Weaknesses ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Weaknesses</div>
        <div style={styles.engraving} />

        {loading && <div style={styles.loadingText}>Consulting the runes…</div>}

        {!loading && weakList.length === 0 && (
          <div style={styles.loadingText}>No weak topics yet — keep studying!</div>
        )}

        {weakList.map(({ topic, score, status }) => (
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
                  background:
                    status === "critical" ? "linear-gradient(90deg, #5a1a1a, #8a3a3a)" :
                    status === "weak"     ? "linear-gradient(90deg, var(--gold-dark), var(--gold-dim))" :
                                           "linear-gradient(90deg, var(--green-dark), var(--green-dim))",
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

        <div style={styles.countdownNumber}>{examDays}</div>
        <div style={styles.countdownLabel}>Days Until Trial</div>
        <div style={styles.countdownSubject}>{examLabel}</div>

        <div style={styles.barTrack}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.max(5, 100 - (examDays / 30) * 100)}%`,
              background: "linear-gradient(90deg, var(--gold-dark), var(--gold))",
            }}
          />
        </div>
      </div>

      {/* ── Active subject ── */}
      {activeSubject && (
        <>
          <div style={styles.engraving} />
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Active Discipline</div>
            <div style={styles.activeSubject}>
              <span style={{ ...styles.diamond, background: activeSubject.color }} />
              <span style={styles.activeSubjectName}>{activeSubject.name}</span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  panel:       { width: "var(--right-panel-width)", minWidth: "var(--right-panel-width)", background: "var(--stone-2)", borderLeft: "1px solid var(--green-dark)", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" },
  section:     { padding: "10px 10px 6px" },
  sectionTitle:{ fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.15em", textTransform: "uppercase" as const, color: "var(--gold-dim)", marginBottom: 2 },
  engraving:   { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.35, margin: "0 10px" },
  statRow:     { display: "flex", gap: 8, marginTop: 6 },
  stat:        { flex: 1, textAlign: "center" as const },
  statNumber:  { fontFamily: "var(--font-header)", fontSize: 20, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 },
  statLabel:   { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" as const, marginTop: 2 },
  streakRow:   { display: "flex", alignItems: "center", gap: 4, marginTop: 6, padding: "3px 6px", background: "var(--stone-3)", border: "1px solid var(--stone-4)" },
  streakIcon:  { fontSize: 10, lineHeight: 1 },
  streakText:  { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", fontStyle: "italic" },
  loadingText: { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", padding: "4px 0" },
  weaknessItem:{ marginBottom: 6 },
  weaknessHeader: { display: "flex", justifyContent: "space-between", marginBottom: 2 },
  weaknessTopic:  { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.3 },
  weaknessScore:  { fontFamily: "var(--font-header)", fontSize: 9, color: "var(--gold-dim)" },
  barTrack:    { height: 3, background: "var(--stone-3)", width: "100%" },
  barFill:     { height: "100%", transition: "width 0.3s ease" },
  countdownNumber: { fontFamily: "var(--font-header)", fontSize: 36, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1, marginTop: 6, textAlign: "center" as const },
  countdownLabel:  { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-dim)", textAlign: "center" as const, marginTop: 2 },
  countdownSubject:{ fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--gold-dim)", textAlign: "center" as const, margin: "4px 0 6px" },
  activeSubject:   { display: "flex", alignItems: "center", gap: 6, marginTop: 5, padding: "4px 6px", background: "var(--stone-3)", border: "1px solid var(--green-dark)" },
  diamond:         { display: "inline-block", width: 6, height: 6, transform: "rotate(45deg)", flexShrink: 0 },
  activeSubjectName: { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
};
