import { useEffect, useState } from "react";
import type { Subject } from "@/App";
import { API_PROGRESS as API } from "@/config";

interface Stats {
  days_at_well:   number;
  trial_accuracy: number;
  streak:         number;
  total_quizzes:  number;
}

interface Weakness {
  topic:  string;
  score:  number;
  status: "critical" | "weak" | "moderate" | "strong";
}

interface RightPanelProps {
  activeSubject?:  Subject;
  authToken?:      string | null;
  examDate?:       Date | null;
  onSetExamDate?:  (d: Date | null) => void;
}

async function fetchJson<T>(url: string, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function daysUntil(target: Date): number {
  const now   = new Date();
  now.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((t.getTime() - now.getTime()) / 86_400_000));
}

// ── Corner mark ornament (L-brackets at top-left and bottom-right) ──
function CornerMark({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <span style={{ position: "absolute", top: 0, left: 0, width: 8, height: 8, borderTop: "1px solid var(--gold-dim)", borderLeft: "1px solid var(--gold-dim)", pointerEvents: "none" }} />
      <span style={{ position: "absolute", bottom: 0, right: 0, width: 8, height: 8, borderBottom: "1px solid var(--gold-dim)", borderRight: "1px solid var(--gold-dim)", pointerEvents: "none" }} />
      {children}
    </div>
  );
}

export default function RightPanel({ activeSubject, authToken, examDate, onSetExamDate }: RightPanelProps) {
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [s, w] = await Promise.all([
          fetchJson<Stats>(`${API}/stats`, authToken),
          fetchJson<Weakness[]>(`${API}/weaknesses`, authToken),
        ]);
        if (!cancelled) { setStats(s); setWeaknesses(w); }
      } catch { /* backend offline or unauthorized — show dashes */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [authToken]);

  const weakList = weaknesses.slice(0, 4);
  const examDays = examDate ? daysUntil(examDate) : null;

  // Exam date label (e.g. "May 24")
  const examLabel = examDate
    ? examDate.toLocaleDateString([], { month: "short", day: "numeric" })
    : null;

  return (
    <aside style={styles.panel}>

      {/* ── Warrior's Record ── */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionRune}>ᚱ</span>
          <span style={styles.sectionTitle}>Warrior's Record</span>
        </div>
        <div style={styles.engraving} />

        <CornerMark style={styles.statBox}>
          <div style={styles.statLabel}>Days at the Well</div>
          <div style={styles.statNumber}>{loading ? "—" : (stats?.days_at_well ?? "—")}</div>
          <div style={styles.statSub}>unbroken vigil</div>
        </CornerMark>

        <CornerMark style={{ ...styles.statBox, marginTop: 8 }}>
          <div style={styles.statLabel}>Trial Accuracy</div>
          <div style={styles.statNumber}>
            {loading ? "—" : stats?.trial_accuracy != null ? `${stats.trial_accuracy}%` : "—"}
          </div>
          <div style={styles.statSub}>last seven suns</div>
        </CornerMark>
      </div>

      <div style={styles.engraving} />

      {/* ── Weaknesses ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitlePlain}>Weaknesses</div>
        <div style={styles.engraving} />

        {loading && <div style={styles.dimText}>Consulting the runes…</div>}
        {!loading && weakList.length === 0 && (
          <div style={styles.dimText}>No weak topics yet.</div>
        )}

        {weakList.map(({ topic, score, status }) => (
          <div key={topic} style={styles.weakRow}>
            <span style={styles.weakTopic}>{topic}</span>
            <div style={styles.weakBarTrack}>
              <div style={{
                ...styles.weakBarFill,
                width: `${score}%`,
                background:
                  status === "critical" ? "#8a3a3a" :
                  status === "weak"     ? "var(--gold-dim)" :
                                          "var(--green-dim)",
              }} />
            </div>
          </div>
        ))}
      </div>

      <div style={styles.engraving} />

      {/* ── Ragnarök Approaches ── */}
      <div style={styles.section}>
        <div style={styles.sectionTitlePlain}>Ragnarök Approaches</div>
        <div style={styles.engraving} />

        <div style={styles.countdownWrap}>
          {examDays !== null ? (
            <>
              <div style={styles.countdownNumber}>{examDays}</div>
              <div style={styles.countdownLabel}>Days Until Trial</div>
              <div style={styles.countdownSubject}>
                {activeSubject ? `${activeSubject.name} · ${examLabel}` : examLabel}
              </div>
            </>
          ) : (
            <div style={styles.dimText}>No exam date set.</div>
          )}
        </div>

        {examDays !== null && (
          <div style={styles.weakBarTrack}>
            <div style={{
              ...styles.weakBarFill,
              width: `${Math.max(5, 100 - (examDays / 90) * 100)}%`,
              background: examDays <= 7 ? "#8a3a3a" : "var(--gold-dim)",
            }} />
          </div>
        )}

        {onSetExamDate && (
          <button
            style={styles.clearExamBtn}
            onClick={() => onSetExamDate(null)}
            title="Clear exam date"
          >
            {examDate ? "clear date" : ""}
          </button>
        )}
      </div>

      {/* ── Active Discipline indicator ── */}
      {activeSubject && (
        <>
          <div style={styles.engraving} />
          <div style={styles.section}>
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

const styles: Record<string, React.CSSProperties> = {
  panel:           { width: "var(--right-panel-width)", minWidth: "var(--right-panel-width)", background: "var(--stone-2)", borderLeft: "1px solid var(--green-dark)", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" },
  section:         { padding: "10px 10px 6px" },
  sectionHeader:   { display: "flex", alignItems: "center", gap: 5, marginBottom: 2 },
  sectionRune:     { fontFamily: "var(--font-header)", fontSize: 9, color: "var(--gold-dim)" },
  sectionTitle:    { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--gold-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  sectionTitlePlain: { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--gold-dim)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  engraving:       { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.35, margin: "2px 0" },
  statBox:         { padding: "7px 8px", background: "var(--stone-3)", marginTop: 6 },
  statLabel:       { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: "var(--text-dim)", marginBottom: 2 },
  statNumber:      { fontFamily: "var(--font-header)", fontSize: 22, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 },
  statSub:         { fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  dimText:         { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", padding: "3px 0" },
  weakRow:         { display: "flex", alignItems: "center", gap: 6, marginBottom: 7 },
  weakTopic:       { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  weakBarTrack:    { width: 40, height: 3, background: "var(--stone-3)", flexShrink: 0 },
  weakBarFill:     { height: "100%", transition: "width 0.3s ease" },
  countdownWrap:   { textAlign: "center" as const, padding: "4px 0 6px" },
  countdownNumber: { fontFamily: "var(--font-header)", fontSize: 34, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 },
  countdownLabel:  { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--text-dim)", marginTop: 3 },
  countdownSubject:{ fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--gold-dim)", marginTop: 3 },
  clearExamBtn:    { background: "none", border: "none", fontFamily: "var(--font-body)", fontSize: 8, fontStyle: "italic", color: "var(--text-dim)", cursor: "pointer", padding: "2px 0", width: "100%", textAlign: "right" as const, marginTop: 2 },
  activeSubject:   { display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", background: "var(--stone-3)", border: "1px solid var(--green-dark)" },
  diamond:         { display: "inline-block", width: 6, height: 6, transform: "rotate(45deg)", flexShrink: 0 },
  activeSubjectName: { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
};
