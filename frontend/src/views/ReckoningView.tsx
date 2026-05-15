/**
 * Reckoning View — full progress dashboard.
 * Shows stats, per-subject topic bars, recent quiz history.
 */

import { useEffect, useState } from "react";
import type { Subject } from "@/App";
import { API_PROGRESS, API_QUIZ } from "@/config";

const API = { progress: API_PROGRESS, quiz: API_QUIZ };

interface Stats {
  days_at_well:   number;
  trial_accuracy: number;
  streak:         number;
  total_quizzes:  number;
}

interface TopicRow {
  id:               number;
  name:             string;
  subject_id:       number;
  confidence_score: number;
  study_count:      number;
  next_review:      string | null;
}

interface QuizHistoryRow {
  id:         number;
  topic_id:   number;
  topic_name: string;
  score:      number;
  total:      number;
  timestamp:  string;
}

interface ReckoningViewProps {
  subjects:  Subject[];
  authToken: string;
}

function authH(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: authH(token) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

// ── Score bar ────────────────────────────────────────────────
function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color =
    pct >= 80 ? "var(--green-dim)" :
    pct >= 60 ? "var(--gold-dim)" :
    pct >= 40 ? "#7a5020" :
                "#8a3a3a";
  return (
    <div style={styles.barTrack}>
      <div style={{ ...styles.barFill, width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function ReckoningView({ subjects, authToken }: ReckoningViewProps) {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [topics,  setTopics]  = useState<TopicRow[]>([]);
  const [history, setHistory] = useState<QuizHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selSub,  setSelSub]  = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [s, t, h] = await Promise.all([
          getJson<Stats>(`${API.progress}/stats`, authToken),
          getJson<TopicRow[]>(`${API.progress}/topics`, authToken),
          getJson<QuizHistoryRow[]>(`${API.quiz}/history?limit=10`, authToken),
        ]);
        if (!cancelled) { setStats(s); setTopics(t); setHistory(h); }
      } catch { /* backend offline */ }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [authToken]);

  const filteredTopics = selSub === "all"
    ? topics
    : topics.filter((t) => String(t.subject_id) === selSub);

  const subjectNameById = (id: number) =>
    subjects.find((s) => s.id === String(id))?.name ?? `Subject ${id}`;

  return (
    <div style={styles.page} className="scroll-area">

      {/* ── Header ── */}
      <div style={styles.pageHeader}>
        <span style={styles.headerRune}>ᚢ</span>
        <div>
          <div style={styles.headerTitle}>The Reckoning</div>
          <div style={styles.headerSub}>Behold your progress, warrior</div>
        </div>
      </div>
      <div style={styles.engraving} />

      {loading && <div style={styles.dimText}>Consulting the runes…</div>}

      {!loading && (
        <>
          {/* ── Stats row ── */}
          <div style={styles.statsRow}>
            {[
              { label: "Days at the Well", value: stats?.days_at_well ?? "—", sub: "unbroken vigil" },
              { label: "Trial Accuracy",   value: stats?.trial_accuracy != null ? `${stats.trial_accuracy}%` : "—", sub: "all time" },
              { label: "Current Streak",   value: stats?.streak ?? "—", sub: "consecutive days" },
              { label: "Trials Completed", value: stats?.total_quizzes ?? "—", sub: "total" },
            ].map(({ label, value, sub }) => (
              <div key={label} style={styles.statBox}>
                <div style={styles.statLabel}>{label}</div>
                <div style={styles.statNumber}>{value}</div>
                <div style={styles.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={styles.engraving} />

          {/* ── Topics ── */}
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Discipline Mastery</span>
            <select
              value={selSub}
              onChange={(e) => setSelSub(e.target.value)}
              style={styles.subSelect}
            >
              <option value="all">All disciplines</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {filteredTopics.length === 0 && (
            <div style={styles.dimText}>No topics tracked yet. Start chatting with Mimir or run a trial.</div>
          )}

          <div style={styles.topicList}>
            {filteredTopics.map((t) => (
              <div key={t.id} style={styles.topicRow}>
                <div style={styles.topicMeta}>
                  <span style={styles.topicName}>{t.name}</span>
                  <span style={styles.topicSubject}>{subjectNameById(t.subject_id)}</span>
                </div>
                <ScoreBar score={t.confidence_score} />
                <div style={styles.topicScore}>{Math.round(t.confidence_score)}%</div>
                <div style={styles.topicStudied}>{t.study_count}×</div>
              </div>
            ))}
          </div>

          {history.length > 0 && (
            <>
              <div style={styles.engraving} />
              <div style={styles.sectionTitle}>Recent Trials</div>
              <div style={styles.historyList}>
                {history.map((h) => {
                  const pct = Math.round((h.score / h.total) * 100);
                  const ts  = new Date(h.timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
                  return (
                    <div key={h.id} style={styles.historyRow}>
                      <span style={styles.historyDate}>{ts}</span>
                      <span style={styles.historyTopic}>{h.topic_name}</span>
                      <span style={styles.historyScore}>{h.score}/{h.total}</span>
                      <span style={{
                        ...styles.historyPct,
                        color: pct >= 80 ? "var(--green-bright)" : pct >= 60 ? "var(--gold-dim)" : "#c87a7a",
                      }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:         { flex: 1, padding: "16px 20px", overflowY: "auto", background: "var(--stone-1)" },
  pageHeader:   { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:   { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle:  { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:    { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:    { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0" },
  dimText:      { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", padding: "8px 0" },
  statsRow:     { display: "flex", gap: 8, flexWrap: "wrap" as const },
  statBox:      { flex: "1 1 120px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", padding: "10px 12px" },
  statLabel:    { fontFamily: "var(--font-header)", fontSize: 7, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--text-dim)", marginBottom: 4 },
  statNumber:   { fontFamily: "var(--font-header)", fontSize: 24, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 },
  statSub:      { fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)", marginTop: 3 },
  sectionHeader:{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sectionTitle: { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--gold-dim)" },
  subSelect:    { background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 11, padding: "3px 6px", outline: "none" },
  topicList:    { display: "flex", flexDirection: "column" as const, gap: 6 },
  topicRow:     { display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  topicMeta:    { flex: 1, minWidth: 0 },
  topicName:    { display: "block", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  topicSubject: { display: "block", fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-dim)", fontStyle: "italic" },
  barTrack:     { width: 80, height: 4, background: "var(--stone-3)", flexShrink: 0 },
  barFill:      { height: "100%", transition: "width 0.3s" },
  topicScore:   { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--gold-dim)", width: 32, textAlign: "right" as const, flexShrink: 0 },
  topicStudied: { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", width: 20, textAlign: "right" as const, flexShrink: 0 },
  historyList:  { display: "flex", flexDirection: "column" as const, gap: 3 },
  historyRow:   { display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  historyDate:  { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", width: 50, flexShrink: 0 },
  historyTopic: { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  historyScore: { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-secondary)", width: 40, flexShrink: 0, textAlign: "right" as const },
  historyPct:   { fontFamily: "var(--font-header)", fontSize: 11, fontWeight: 700, width: 38, flexShrink: 0, textAlign: "right" as const },
};
