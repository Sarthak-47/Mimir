/**
 * Reckoning View — full progress dashboard.
 *
 * Sections:
 *  1. Exam Countdown — days remaining + set-date picker (persisted to backend)
 *  2. Stats Row — days at the well, accuracy, streak, quiz count
 *  3. Readiness — per-topic Ebbinghaus-decayed readiness bars
 *  4. Seven-Day Schedule — AI-ranked daily study recommendations
 *  5. Recent Trials — last 10 quiz history rows
 */

import { useEffect, useState, useCallback } from "react";
import type { Subject } from "@/App";
import { API_PROGRESS, API_QUIZ } from "@/config";

// ── Types ────────────────────────────────────────────────────

interface Stats {
  days_at_well:   number;
  trial_accuracy: number;
  streak:         number;
  total_quizzes:  number;
}

interface ReadinessRow {
  id:               number;
  name:             string;
  subject_id:       number;
  confidence_score: number;
  readiness:        number;
  priority:         "critical" | "weak" | "moderate" | "strong";
  last_studied:     string | null;
  days_since:       number;
}

interface ScheduleTopic {
  name:      string;
  subject:   string;
  readiness: number;
  priority:  "critical" | "weak" | "moderate" | "strong";
}

interface ScheduleDay {
  date:            string;
  day_label:       string;
  days_until_exam: number | null;
  topics:          ScheduleTopic[];
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

// ── Helpers ──────────────────────────────────────────────────

function authH(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: authH(token) });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

async function putJson<T>(url: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...authH(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

// ── Sub-components ───────────────────────────────────────────

/** Horizontal readiness bar with colour coding. */
function ReadinessBar({ value }: { value: number }) {
  const pct   = Math.min(100, Math.max(0, value));
  const color =
    pct >= 80 ? "var(--green-dim)" :
    pct >= 60 ? "var(--gold-dim)" :
    pct >= 40 ? "#7a5020" :
                "#8a3a3a";
  return (
    <div style={S.barTrack}>
      <div style={{ ...S.barFill, width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Priority badge (CRITICAL / WEAK / etc.) */
function PriorityBadge({ p }: { p: ReadinessRow["priority"] }) {
  const colors: Record<string, string> = {
    critical: "#8a3a3a",
    weak:     "#7a5020",
    moderate: "var(--gold-dim)",
    strong:   "var(--green-dim)",
  };
  return (
    <span style={{ ...S.badge, background: colors[p] ?? "var(--stone-4)" }}>
      {p.toUpperCase()}
    </span>
  );
}

/** Exam countdown widget shown at the top when exam_date is set. */
function ExamCountdown({
  examDate, daysLeft, onClear,
}: {
  examDate: string; daysLeft: number; onClear: () => void;
}) {
  const urgent = daysLeft <= 7;
  const close  = daysLeft <= 14;
  const color  = urgent ? "#c87a7a" : close ? "var(--gold-bright)" : "var(--green-bright)";
  return (
    <div style={{ ...S.examBanner, borderColor: color }}>
      <span style={S.examRune}>ᛏ</span>
      <div style={S.examCenter}>
        <span style={{ ...S.examDays, color }}>{daysLeft}</span>
        <span style={S.examLabel}>
          {daysLeft === 0 ? "EXAM DAY" : daysLeft === 1 ? "DAY UNTIL EXAM" : "DAYS UNTIL EXAM"}
        </span>
        <span style={S.examDate}>{new Date(examDate + "T00:00:00").toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</span>
      </div>
      <button style={S.examClear} onClick={onClear} title="Clear exam date">✕</button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────

export default function ReckoningView({ subjects, authToken }: ReckoningViewProps) {
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [readiness, setReadiness] = useState<ReadinessRow[]>([]);
  const [schedule,  setSchedule]  = useState<ScheduleDay[]>([]);
  const [history,   setHistory]   = useState<QuizHistoryRow[]>([]);
  const [examDate,  setExamDate]  = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [selSub,    setSelSub]    = useState<string>("all");
  const [dateInput, setDateInput] = useState("");
  const [savingDate, setSavingDate] = useState(false);

  // ── Data loading ─────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, sch, h, ed] = await Promise.all([
        getJson<Stats>(`${API_PROGRESS}/stats`, authToken),
        getJson<ReadinessRow[]>(`${API_PROGRESS}/readiness`, authToken),
        getJson<ScheduleDay[]>(`${API_PROGRESS}/schedule`, authToken),
        getJson<QuizHistoryRow[]>(`${API_QUIZ}/history?limit=10`, authToken),
        getJson<{ exam_date: string | null }>(`${API_PROGRESS}/exam-date`, authToken),
      ]);
      setStats(s);
      setReadiness(r);
      setSchedule(sch);
      setHistory(h);
      setExamDate(ed.exam_date);
      if (ed.exam_date) setDateInput(ed.exam_date);
    } catch {
      /* backend offline — silently retain stale state */
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Exam date save / clear ────────────────────────────────

  const saveExamDate = async () => {
    if (!dateInput) return;
    setSavingDate(true);
    try {
      const r = await putJson<{ exam_date: string | null }>(
        `${API_PROGRESS}/exam-date`, authToken, { exam_date: dateInput }
      );
      setExamDate(r.exam_date);
      // Refresh schedule — it depends on exam date
      const sch = await getJson<ScheduleDay[]>(`${API_PROGRESS}/schedule`, authToken);
      setSchedule(sch);
    } catch { /* ignore */ }
    finally { setSavingDate(false); }
  };

  const clearExamDate = async () => {
    setSavingDate(true);
    try {
      await putJson(`${API_PROGRESS}/exam-date`, authToken, { exam_date: null });
      setExamDate(null);
      setDateInput("");
      const sch = await getJson<ScheduleDay[]>(`${API_PROGRESS}/schedule`, authToken);
      setSchedule(sch);
    } catch { /* ignore */ }
    finally { setSavingDate(false); }
  };

  // ── Derived data ──────────────────────────────────────────

  const filteredReadiness = selSub === "all"
    ? readiness
    : readiness.filter((t) => String(t.subject_id) === selSub);

  const subjectName = (id: number) =>
    subjects.find((s) => s.id === String(id))?.name ?? `Discipline ${id}`;

  const daysLeft = examDate
    ? Math.max(0, Math.round((new Date(examDate + "T00:00:00").getTime() - Date.now()) / 86400000))
    : null;

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={S.page} className="scroll-area">

      {/* ── Header ── */}
      <div style={S.pageHeader}>
        <span style={S.headerRune}>ᚢ</span>
        <div>
          <div style={S.headerTitle}>The Reckoning</div>
          <div style={S.headerSub}>Behold your progress, warrior</div>
        </div>
      </div>
      <div style={S.engraving} />

      {loading && <div style={S.dimText}>Consulting the runes…</div>}

      {!loading && (
        <>
          {/* ── Exam countdown ── */}
          {examDate && daysLeft !== null ? (
            <ExamCountdown examDate={examDate} daysLeft={daysLeft} onClear={clearExamDate} />
          ) : (
            <div style={S.examSetRow}>
              <span style={S.examSetLabel}>Set exam date →</span>
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                style={S.dateInput}
                min={new Date().toISOString().split("T")[0]}
              />
              <button
                style={S.setDateBtn}
                onClick={saveExamDate}
                disabled={!dateInput || savingDate}
              >
                {savingDate ? "…" : "SAVE"}
              </button>
            </div>
          )}

          <div style={S.engraving} />

          {/* ── Stats row ── */}
          <div style={S.statsRow}>
            {[
              { label: "Days at the Well",  value: stats?.days_at_well ?? "—",                                 sub: "unbroken vigil" },
              { label: "Trial Accuracy",    value: stats?.trial_accuracy != null ? `${stats.trial_accuracy}%` : "—", sub: "all time" },
              { label: "Current Streak",    value: stats?.streak ?? "—",                                       sub: "consecutive days" },
              { label: "Trials Completed",  value: stats?.total_quizzes ?? "—",                                sub: "total" },
            ].map(({ label, value, sub }) => (
              <div key={label} style={S.statBox}>
                <div style={S.statLabel}>{label}</div>
                <div style={S.statNumber}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={S.engraving} />

          {/* ── Readiness ── */}
          <div style={S.sectionHeader}>
            <span style={S.sectionTitle}>Discipline Readiness</span>
            <select value={selSub} onChange={(e) => setSelSub(e.target.value)} style={S.subSelect}>
              <option value="all">All disciplines</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div style={S.readinessCap}>
            Readiness accounts for time elapsed since last study (forgetting curve).
          </div>

          {filteredReadiness.length === 0 && (
            <div style={S.dimText}>No topics tracked yet. Start chatting with Mimir or run a trial.</div>
          )}

          <div style={S.topicList}>
            {filteredReadiness.map((t) => {
              const decayed = t.readiness < t.confidence_score - 2;
              return (
                <div key={t.id} style={S.topicRow}>
                  <div style={S.topicMeta}>
                    <span style={S.topicName}>{t.name}</span>
                    <span style={S.topicSubject}>{subjectName(t.subject_id)}</span>
                  </div>
                  <ReadinessBar value={t.readiness} />
                  <div style={S.topicScore}>{t.readiness}%</div>
                  {decayed && (
                    <span style={S.decayBadge} title={`${t.days_since}d since last study`}>
                      ↓{Math.round(t.confidence_score - t.readiness)}%
                    </span>
                  )}
                  <PriorityBadge p={t.priority} />
                </div>
              );
            })}
          </div>

          {/* ── 7-day schedule ── */}
          {schedule.length > 0 && (
            <>
              <div style={S.engraving} />
              <div style={S.sectionTitle}>Seven-Day War Plan</div>
              <div style={S.scheduleCap}>
                Ranked by readiness decay{examDate ? " and exam proximity" : ""}. Focus on critical topics first.
              </div>
              <div style={S.scheduleGrid}>
                {schedule.map((day) => (
                  <div key={day.date} style={S.scheduleDay}>
                    <div style={S.scheduleDayHeader}>
                      <span style={S.scheduleDayLabel}>{day.day_label}</span>
                      {day.days_until_exam !== null && day.days_until_exam > 0 && (
                        <span style={S.scheduleDaysExam}>T−{day.days_until_exam}</span>
                      )}
                    </div>
                    {day.topics.length === 0 ? (
                      <span style={S.dimText}>Rest day</span>
                    ) : (
                      day.topics.map((t, i) => {
                        const badgeColor =
                          t.priority === "critical" ? "#8a3a3a" :
                          t.priority === "weak"     ? "#7a5020" :
                          t.priority === "moderate" ? "var(--gold-dim)" :
                                                      "var(--green-dim)";
                        return (
                          <div key={i} style={S.scheduleTopicRow}>
                            <span style={{ ...S.scheduleDot, background: badgeColor }} />
                            <div style={S.scheduleTopicInfo}>
                              <span style={S.scheduleTopicName}>{t.name}</span>
                              <span style={S.scheduleTopicSubject}>{t.subject}</span>
                            </div>
                            <span style={S.scheduleReadiness}>{t.readiness}%</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Recent trials ── */}
          {history.length > 0 && (
            <>
              <div style={S.engraving} />
              <div style={S.sectionTitle}>Recent Trials</div>
              <div style={S.historyList}>
                {history.map((h) => {
                  const pct = Math.round((h.score / h.total) * 100);
                  const ts  = new Date(h.timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
                  return (
                    <div key={h.id} style={S.historyRow}>
                      <span style={S.historyDate}>{ts}</span>
                      <span style={S.historyTopic}>{h.topic_name}</span>
                      <span style={S.historyScore}>{h.score}/{h.total}</span>
                      <span style={{
                        ...S.historyPct,
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

// ── Styles ───────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:           { flex: 1, padding: "16px 20px", overflowY: "auto", background: "var(--stone-1)" },
  pageHeader:     { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:     { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle:    { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:      { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:      { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0" },
  dimText:        { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", padding: "4px 0" },

  // ── Exam countdown ──
  examBanner:     { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--stone-2)", border: "1px solid", marginBottom: 8 },
  examRune:       { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", flexShrink: 0 },
  examCenter:     { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center" },
  examDays:       { fontFamily: "var(--font-header)", fontSize: 36, fontWeight: 700, lineHeight: 1 },
  examLabel:      { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.18em", color: "var(--text-dim)", marginTop: 2 },
  examDate:       { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  examClear:      { background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14, padding: "2px 4px", flexShrink: 0 },

  // ── Exam date set row ──
  examSetRow:     { display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" as const },
  examSetLabel:   { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", color: "var(--text-dim)" },
  dateInput:      { background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 12, padding: "4px 7px", outline: "none", colorScheme: "dark" },
  setDateBtn:     { background: "var(--green-dark)", border: "1px solid var(--green)", color: "var(--green-bright)", fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.14em", padding: "4px 10px", cursor: "pointer" },

  // ── Stats ──
  statsRow:       { display: "flex", gap: 8, flexWrap: "wrap" as const },
  statBox:        { flex: "1 1 120px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", padding: "10px 12px" },
  statLabel:      { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--text-dim)", marginBottom: 4 },
  statNumber:     { fontFamily: "var(--font-header)", fontSize: 24, fontWeight: 700, color: "var(--gold-bright)", lineHeight: 1 },
  statSub:        { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", marginTop: 3 },

  // ── Section headings ──
  sectionHeader:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  sectionTitle:   { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase" as const, color: "var(--gold-dim)" },
  subSelect:      { background: "var(--stone-3)", border: "1px solid var(--green-dark)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: 11, padding: "3px 6px", outline: "none" },
  readinessCap:   { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", marginBottom: 8 },

  // ── Topic readiness list ──
  topicList:      { display: "flex", flexDirection: "column" as const, gap: 5 },
  topicRow:       { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  topicMeta:      { flex: 1, minWidth: 0 },
  topicName:      { display: "block", fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  topicSubject:   { display: "block", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" },
  barTrack:       { width: 80, height: 4, background: "var(--stone-3)", flexShrink: 0 },
  barFill:        { height: "100%", transition: "width 0.4s" },
  topicScore:     { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--gold-dim)", width: 36, textAlign: "right" as const, flexShrink: 0 },
  decayBadge:     { fontFamily: "var(--font-body)", fontSize: 9, color: "#c87a7a", fontStyle: "italic", flexShrink: 0, whiteSpace: "nowrap" as const },
  badge:          { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", padding: "2px 5px", color: "#fff", flexShrink: 0 },

  // ── Schedule ──
  scheduleCap:    { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", margin: "4px 0 10px" },
  scheduleGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 },
  scheduleDay:    { background: "var(--stone-2)", border: "1px solid var(--green-dark)", padding: "8px 10px", display: "flex", flexDirection: "column" as const, gap: 5 },
  scheduleDayHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  scheduleDayLabel: { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", color: "var(--gold-bright)" },
  scheduleDaysExam: { fontFamily: "var(--font-header)", fontSize: 8, color: "var(--text-dim)", letterSpacing: "0.08em" },
  scheduleTopicRow: { display: "flex", alignItems: "center", gap: 5 },
  scheduleDot:    { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  scheduleTopicInfo: { flex: 1, minWidth: 0 },
  scheduleTopicName: { display: "block", fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  scheduleTopicSubject: { display: "block", fontFamily: "var(--font-body)", fontSize: 9, color: "var(--text-dim)", fontStyle: "italic" },
  scheduleReadiness: { fontFamily: "var(--font-header)", fontSize: 9, color: "var(--text-dim)", flexShrink: 0 },

  // ── Trial history ──
  historyList:    { display: "flex", flexDirection: "column" as const, gap: 3 },
  historyRow:     { display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  historyDate:    { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", width: 50, flexShrink: 0 },
  historyTopic:   { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  historyScore:   { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-secondary)", width: 40, flexShrink: 0, textAlign: "right" as const },
  historyPct:     { fontFamily: "var(--font-header)", fontSize: 11, fontWeight: 700, width: 38, flexShrink: 0, textAlign: "right" as const },
};
