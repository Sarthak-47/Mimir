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

interface PredictedGrade {
  grade:      string;
  percentage: number;
  trend:      "improving" | "stable" | "declining";
  confidence: "high" | "medium" | "low";
  summary:    string;
}

interface VelocityEntry {
  id:            number;
  name:          string;
  subject_id:    number;
  velocity:      "mastered" | "rising" | "stable" | "falling" | "untested";
  slope:         number;
  recent_scores: number[];
  session_count: number;
  latest_score:  number;
}

interface HeatmapDay {
  date:       string;
  quiz_count: number;
  chat_count: number;
  total:      number;
}

interface TopicActivity {
  topic_id:   number;
  name:       string;
  subject_id: number;
  count:      number;
}

interface HeatmapData {
  days:     HeatmapDay[];
  by_topic: TopicActivity[];
}

interface ReckoningViewProps {
  subjects:          Subject[];
  authToken:         string;
  /** Called whenever the exam date is saved or cleared, so App-level state stays in sync. */
  onExamDateChange?: (date: string | null) => void;
  /** Opens the knowledge graph modal for the current subject filter. */
  onOpenGraph?:      (subjectId: string | null) => void;
  /** Displayed user name for the export report. */
  username?:         string;
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

/** Mini SVG sparkline for a series of 0–100 scores. */
function Sparkline({ scores, color }: { scores: number[]; color: string }) {
  if (scores.length < 2) {
    return <div style={{ width: 72, height: 24, flexShrink: 0 }} />;
  }
  const W = 72, H = 24, pad = 2;
  const n   = scores.length;
  const pts = scores.map((v, i) => {
    const x = pad + (i / (n - 1)) * (W - pad * 2);
    const y = H - pad - ((v / 100) * (H - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={W} height={H} style={{ flexShrink: 0, display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest score dot */}
      {(() => {
        const last = pts.split(" ").pop()!.split(",");
        return (
          <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
        );
      })()}
    </svg>
  );
}

/**
 * Build a standalone HTML string and open the browser print dialog.
 * Uses window.print() — works cross-platform, no extra libraries.
 */
function printProgressReport(opts: {
  stats:    Stats | null;
  readiness: ReadinessRow[];
  history:   QuizHistoryRow[];
  examDate?: string | null;
  username?: string;
}) {
  const { stats, readiness, history, examDate, username } = opts;
  const now = new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" });

  const rows = readiness.slice(0, 20).map((r) => {
    const bar = `<div style="display:inline-block;height:8px;width:${Math.round(r.readiness)}px;max-width:200px;background:${r.priority === "critical" ? "#c0392b" : r.priority === "weak" ? "#d4934a" : r.priority === "moderate" ? "#d4a82c" : "#329944"};vertical-align:middle"></div>`;
    return `<tr>
      <td>${r.name}</td>
      <td>${r.priority.toUpperCase()}</td>
      <td>${bar} ${Math.round(r.readiness)}%</td>
      <td>${r.days_since > 0 ? `${Math.round(r.days_since)}d ago` : "today"}</td>
    </tr>`;
  }).join("");

  const histRows = history.slice(0, 15).map((h) => {
    const pct = Math.round((h.score / h.total) * 100);
    const d = new Date(h.timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
    return `<tr>
      <td>${d}</td>
      <td>${h.topic_name}</td>
      <td>${h.score}/${h.total} (${pct}%)</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>Mimir Progress Report — ${now}</title>
<style>
  body { font-family: Georgia, serif; font-size: 13px; color: #111; margin: 32px 40px; }
  h1   { font-size: 22px; margin-bottom: 4px; }
  h2   { font-size: 14px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }
  .meta { font-size: 11px; color: #666; margin-bottom: 24px; }
  .stats-grid { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 8px; }
  .stat { text-align: center; border: 1px solid #ddd; padding: 8px 16px; min-width: 80px; }
  .stat-val { font-size: 28px; font-weight: 700; }
  .stat-lbl { font-size: 10px; text-transform: uppercase; color: #666; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  th    { text-align: left; border-bottom: 2px solid #bbb; padding: 4px 8px; font-size: 11px; text-transform: uppercase; color: #666; }
  td    { padding: 4px 8px; border-bottom: 1px solid #eee; }
  @media print { body { margin: 16px 20px; } }
</style></head><body>
<h1>Mimir Progress Report</h1>
<div class="meta">${username ? `Warrior: ${username} · ` : ""}Generated: ${now}${examDate ? ` · Exam: ${examDate}` : ""}</div>

${stats ? `<h2>Overview</h2>
<div class="stats-grid">
  <div class="stat"><div class="stat-val">${stats.days_at_well}</div><div class="stat-lbl">Days at the Well</div></div>
  <div class="stat"><div class="stat-val">${stats.trial_accuracy}%</div><div class="stat-lbl">Trial Accuracy</div></div>
  <div class="stat"><div class="stat-val">${stats.streak}</div><div class="stat-lbl">Streak</div></div>
  <div class="stat"><div class="stat-val">${stats.total_quizzes}</div><div class="stat-lbl">Total Quizzes</div></div>
</div>` : ""}

${rows ? `<h2>Topic Readiness (Top 20)</h2>
<table>
  <tr><th>Topic</th><th>Priority</th><th>Readiness</th><th>Last Studied</th></tr>
  ${rows}
</table>` : ""}

${histRows ? `<h2>Recent Trials (Last 15)</h2>
<table>
  <tr><th>Date</th><th>Topic</th><th>Score</th></tr>
  ${histRows}
</table>` : ""}

<div style="margin-top:32px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:8px;">
  Generated by Mimir — Your Norse Study Companion
</div>
</body></html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Please allow pop-ups to export the report."); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => win.print();
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

export default function ReckoningView({ subjects, authToken, onExamDateChange, onOpenGraph, username }: ReckoningViewProps) {
  const [stats,          setStats]          = useState<Stats | null>(null);
  const [readiness,      setReadiness]      = useState<ReadinessRow[]>([]);
  const [schedule,       setSchedule]       = useState<ScheduleDay[]>([]);
  const [history,        setHistory]        = useState<QuizHistoryRow[]>([]);
  const [predictedGrade, setPredictedGrade] = useState<PredictedGrade | null>(null);
  const [velocity,       setVelocity]       = useState<VelocityEntry[]>([]);
  const [heatmap,        setHeatmap]        = useState<HeatmapData | null>(null);
  const [examDate,       setExamDate]       = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [selSub,         setSelSub]         = useState<string>("all");
  const [dateInput,      setDateInput]      = useState("");
  const [savingDate,     setSavingDate]     = useState(false);

  // ── Data loading ─────────────────────────────────────────

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, sch, h, ed, pg, vel, hm] = await Promise.all([
        getJson<Stats>(`${API_PROGRESS}/stats`, authToken),
        getJson<ReadinessRow[]>(`${API_PROGRESS}/readiness`, authToken),
        getJson<ScheduleDay[]>(`${API_PROGRESS}/schedule`, authToken),
        getJson<QuizHistoryRow[]>(`${API_QUIZ}/history?limit=10`, authToken),
        getJson<{ exam_date: string | null }>(`${API_PROGRESS}/exam-date`, authToken),
        getJson<PredictedGrade>(`${API_PROGRESS}/predicted-grade`, authToken).catch(() => null),
        getJson<VelocityEntry[]>(`${API_PROGRESS}/velocity`, authToken).catch(() => [] as VelocityEntry[]),
        getJson<HeatmapData>(`${API_PROGRESS}/heatmap?days=30`, authToken).catch(() => null),
      ]);
      setStats(s);
      setReadiness(r);
      setSchedule(sch);
      setHistory(h);
      setPredictedGrade(pg);
      setVelocity(vel);
      setHeatmap(hm);
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
      onExamDateChange?.(r.exam_date);   // keep App-level state in sync → RightPanel
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
      onExamDateChange?.(null);          // keep App-level state in sync → RightPanel
      const sch = await getJson<ScheduleDay[]>(`${API_PROGRESS}/schedule`, authToken);
      setSchedule(sch);
    } catch { /* ignore */ }
    finally { setSavingDate(false); }
  };

  // ── Derived data ──────────────────────────────────────────

  const filteredReadiness = selSub === "all"
    ? readiness
    : readiness.filter((t) => String(t.subject_id) === selSub);

  const filteredVelocity = (selSub === "all"
    ? velocity
    : velocity.filter((t) => String(t.subject_id) === selSub)
  ).filter((t) => t.session_count >= 2);   // hide untested topics from velocity section

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
        <button
          style={S.exportBtn}
          onClick={() => printProgressReport({ stats, readiness, history, examDate, username })}
          title="Export progress report as PDF"
        >
          ᛖ Export Report
        </button>
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

          {/* ── Predicted grade ── */}
          {predictedGrade && predictedGrade.grade !== "?" && (() => {
            const gcol =
              predictedGrade.grade === "A" ? "var(--green-bright)" :
              predictedGrade.grade === "B" ? "var(--gold-bright)" :
              predictedGrade.grade === "C" ? "#d4934a" :
              predictedGrade.grade === "D" ? "#c87a7a" : "#8a3a3a";
            const trendIcon =
              predictedGrade.trend === "improving" ? "↑" :
              predictedGrade.trend === "declining" ? "↓" : "→";
            const trendCol =
              predictedGrade.trend === "improving" ? "var(--green-bright)" :
              predictedGrade.trend === "declining" ? "#c87a7a" : "var(--text-dim)";
            return (
              <div style={{ ...S.gradeBanner, borderColor: gcol }}>
                <div style={{ ...S.gradeLetterBox, color: gcol }}>
                  {predictedGrade.grade}
                </div>
                <div style={S.gradeBody}>
                  <span style={S.gradeTitle}>Predicted Grade</span>
                  <span style={S.gradePct}>{predictedGrade.percentage.toFixed(0)}%</span>
                  <span style={S.gradeSummary}>{predictedGrade.summary}</span>
                </div>
                <div style={S.gradeTrend}>
                  <span style={{ ...S.trendIcon, color: trendCol }}>{trendIcon}</span>
                  <span style={{ ...S.trendLabel, color: trendCol }}>
                    {predictedGrade.trend}
                  </span>
                  <span style={S.confidenceLabel}>
                    {predictedGrade.confidence} confidence
                  </span>
                </div>
              </div>
            );
          })()}

          <div style={S.engraving} />

          {/* ── Readiness ── */}
          <div style={S.sectionHeader}>
            <span style={S.sectionTitle}>Discipline Readiness</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {onOpenGraph && (
                <button
                  style={S.graphBtn}
                  onClick={() => onOpenGraph(selSub === "all" ? null : selSub)}
                  title="View prerequisite knowledge graph"
                >ᚷ GRAPH</button>
              )}
              <select value={selSub} onChange={(e) => setSelSub(e.target.value)} style={S.subSelect}>
                <option value="all">All disciplines</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
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

          {/* ── Learning velocity ── */}
          {filteredVelocity.length > 0 && (() => {
            const freeFall = filteredVelocity.filter((t) => t.velocity === "falling");
            const mastered = filteredVelocity.filter((t) => t.velocity === "mastered");
            return (
              <>
                <div style={S.engraving} />
                <div style={S.sectionTitle}>Learning Velocity</div>
                <div style={S.readinessCap}>
                  Slope = percentage-point change per quiz session. Based on last 8 sessions per topic.
                </div>

                {/* Free-fall callout */}
                {freeFall.length > 0 && (
                  <div style={S.velocityAlert}>
                    <span style={S.alertRune}>↓</span>
                    <span style={S.alertText}>
                      {freeFall.length} topic{freeFall.length > 1 ? "s" : ""} in free-fall:{" "}
                      {freeFall.map((t) => t.name).join(", ")}
                    </span>
                  </div>
                )}
                {/* Mastered callout */}
                {mastered.length > 0 && (
                  <div style={{ ...S.velocityAlert, ...S.velocityAlertGood }}>
                    <span style={S.alertRune}>★</span>
                    <span style={S.alertText}>
                      {mastered.length} topic{mastered.length > 1 ? "s" : ""} mastered:{" "}
                      {mastered.map((t) => t.name).join(", ")}
                    </span>
                  </div>
                )}

                <div style={S.velocityList}>
                  {filteredVelocity.map((t) => {
                    const velColor =
                      t.velocity === "mastered" ? "var(--green-bright)" :
                      t.velocity === "rising"   ? "var(--gold-bright)"  :
                      t.velocity === "falling"  ? "#c87a7a"             :
                                                   "var(--text-dim)";
                    const velArrow =
                      t.velocity === "mastered" ? "★" :
                      t.velocity === "rising"   ? (t.slope > 8 ? "↑↑" : "↑") :
                      t.velocity === "falling"  ? (t.slope < -8 ? "↓↓" : "↓") :
                                                   "→";
                    const slopeStr = t.slope > 0
                      ? `+${t.slope.toFixed(1)}`
                      : t.slope.toFixed(1);
                    return (
                      <div key={t.id} style={S.velocityRow}>
                        <div style={S.topicMeta}>
                          <span style={S.topicName}>{t.name}</span>
                          <span style={S.topicSubject}>{subjectName(t.subject_id)}</span>
                        </div>
                        <Sparkline scores={t.recent_scores} color={velColor} />
                        <span style={{ ...S.velArrow, color: velColor }}>{velArrow}</span>
                        <span style={{ ...S.velSlope, color: velColor }}>{slopeStr} pp</span>
                        <span style={S.velLatest}>{t.latest_score.toFixed(0)}%</span>
                        <span style={{ ...S.velocityBadge, color: velColor }}>
                          {t.velocity.toUpperCase()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* ── Activity heatmap ── */}
          {heatmap && heatmap.days.some((d) => d.total > 0) && (() => {
            const maxTotal = Math.max(...heatmap.days.map((d) => d.total), 1);
            return (
              <>
                <div style={S.engraving} />
                <div style={S.sectionTitle}>Study Activity — Last 30 Days</div>
                <div style={S.readinessCap}>
                  Each cell = one day. Darker = more activity (quizzes + chat messages).
                </div>

                {/* Heatmap grid — 7 columns × up to 5 rows */}
                <div style={S.heatGrid}>
                  {heatmap.days.map((day) => {
                    const frac  = day.total / maxTotal;
                    const bg    =
                      frac === 0   ? "var(--stone-3)" :
                      frac < 0.25  ? "#1a3a1a" :
                      frac < 0.5   ? "#2a5a2a" :
                      frac < 0.75  ? "#3a7a3a" :
                                     "#4a9a4a";
                    const label = new Date(day.date + "T00:00:00")
                      .toLocaleDateString([], { month: "short", day: "numeric" });
                    return (
                      <div
                        key={day.date}
                        style={{ ...S.heatCell, background: bg }}
                        title={`${label}: ${day.quiz_count} quiz${day.quiz_count !== 1 ? "zes" : ""}, ${day.chat_count} message${day.chat_count !== 1 ? "s" : ""}`}
                      />
                    );
                  })}
                </div>

                {/* Legend */}
                <div style={S.heatLegend}>
                  <span style={S.heatLegendLabel}>Less</span>
                  {["var(--stone-3)", "#1a3a1a", "#2a5a2a", "#3a7a3a", "#4a9a4a"].map((c) => (
                    <div key={c} style={{ ...S.heatCell, background: c, flexShrink: 0 }} />
                  ))}
                  <span style={S.heatLegendLabel}>More</span>
                </div>

                {/* Top topics */}
                {heatmap.by_topic.length > 0 && (
                  <div style={S.heatTopics}>
                    <span style={S.heatTopicsLabel}>Most studied:</span>
                    {heatmap.by_topic.slice(0, 5).map((t) => (
                      <span key={t.topic_id} style={S.heatTopicChip}>
                        {t.name}
                        <span style={S.heatTopicCount}>{t.count}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

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
  page:           { flex: 1, padding: "16px 20px", overflowY: "auto", background: "transparent" },
  pageHeader:     { display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" as const },
  exportBtn:      { marginLeft: "auto", background: "none", border: "1px solid var(--gold-dark)", color: "var(--gold-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.12em", padding: "5px 12px", cursor: "pointer", transition: "border-color 0.15s, color 0.15s" },
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

  // ── Predicted grade ──
  gradeBanner:    { display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: "var(--stone-2)", border: "1px solid", marginBottom: 8 },
  gradeLetterBox: { fontFamily: "var(--font-header)", fontSize: 48, fontWeight: 700, lineHeight: 1, flexShrink: 0, width: 56, textAlign: "center" as const },
  gradeBody:      { flex: 1, display: "flex", flexDirection: "column" as const, gap: 2, minWidth: 0 },
  gradeTitle:     { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase" as const, color: "var(--text-dim)" },
  gradePct:       { fontFamily: "var(--font-header)", fontSize: 16, color: "var(--gold-bright)", lineHeight: 1 },
  gradeSummary:   { fontFamily: "var(--font-body)", fontSize: 10, fontStyle: "italic", color: "var(--text-dim)", lineHeight: 1.4 },
  gradeTrend:     { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2, flexShrink: 0 },
  trendIcon:      { fontFamily: "var(--font-header)", fontSize: 20, lineHeight: 1 },
  trendLabel:     { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase" as const },
  confidenceLabel:{ fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)" },

  // ── Velocity ──
  velocityList:       { display: "flex", flexDirection: "column" as const, gap: 4 },
  velocityRow:        { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  velocityAlert:      { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#2a1a1a", border: "1px solid #5a2a2a", marginBottom: 6 },
  velocityAlertGood:  { background: "#1a2a1a", border: "1px solid #2a5a2a" },
  alertRune:          { fontFamily: "var(--font-header)", fontSize: 14, color: "#c87a7a", flexShrink: 0 },
  alertText:          { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-secondary)", flex: 1 },
  velArrow:           { fontFamily: "var(--font-header)", fontSize: 14, lineHeight: 1, width: 20, textAlign: "center" as const, flexShrink: 0 },
  velSlope:           { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.06em", width: 46, textAlign: "right" as const, flexShrink: 0 },
  velLatest:          { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-dim)", width: 30, textAlign: "right" as const, flexShrink: 0 },
  velocityBadge:      { fontFamily: "var(--font-header)", fontSize: 8, letterSpacing: "0.12em", width: 64, textAlign: "right" as const, flexShrink: 0 },

  // ── GRAPH button ──
  graphBtn:       { background: "var(--stone-3)", border: "1px solid var(--gold-dim)", color: "var(--gold-bright)", fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.12em", cursor: "pointer", padding: "4px 10px", transition: "all 0.15s" },

  // ── Activity heatmap ──
  heatGrid:       { display: "flex", flexWrap: "wrap" as const, gap: 3, marginBottom: 6 },
  heatCell:       { width: 14, height: 14, borderRadius: 2, flexShrink: 0 },
  heatLegend:     { display: "flex", alignItems: "center", gap: 3, marginBottom: 8 },
  heatLegendLabel:{ fontFamily: "var(--font-body)", fontSize: 9, fontStyle: "italic", color: "var(--text-dim)" },
  heatTopics:     { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, marginBottom: 4 },
  heatTopicsLabel:{ fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.1em", color: "var(--text-dim)", flexShrink: 0 },
  heatTopicChip:  { display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", background: "var(--stone-3)", border: "1px solid var(--green-dark)", fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)" },
  heatTopicCount: { fontFamily: "var(--font-header)", fontSize: 9, color: "var(--gold-dim)", marginLeft: 2 },

  // ── Trial history ──
  historyList:    { display: "flex", flexDirection: "column" as const, gap: 3 },
  historyRow:     { display: "flex", alignItems: "center", gap: 10, padding: "4px 8px", background: "var(--stone-2)", border: "1px solid var(--green-dark)" },
  historyDate:    { fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", width: 50, flexShrink: 0 },
  historyTopic:   { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", flex: 1, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" },
  historyScore:   { fontFamily: "var(--font-header)", fontSize: 10, color: "var(--text-secondary)", width: 40, flexShrink: 0, textAlign: "right" as const },
  historyPct:     { fontFamily: "var(--font-header)", fontSize: 11, fontWeight: 700, width: 38, flexShrink: 0, textAlign: "right" as const },
};
