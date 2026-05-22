/**
 * Fates View — Study Plan, Schedule & Syllabus Coverage
 *
 * Sections:
 * 1. TODAY'S TASKS — top-3 topics from the 7-day schedule for the next day
 * 2. OVERDUE — topics with readiness < 40 that have never been revisited
 * 3. 7-DAY SCHEDULE — day-by-day topic calendar
 * 4. SYLLABUS COVERAGE — per-section coverage heatmap
 *    + import / manage syllabi
 */

import { useEffect, useState, useCallback } from "react";
import { API_PROGRESS, API_SYLLABUS } from "@/config";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface ReadinessTopic {
  topic:    string;
  subject?: string;
  readiness: number;
  priority:  string;
}

interface SyllabusRow {
  id:         number;
  name:       string;
  exam_board: string;
  level:      string;
  item_count: number;
}

interface CoverageSection {
  section:       string;
  total:         number;
  studied:       number;
  coverage_pct:  number;
}

interface Coverage {
  syllabus_id:   number;
  syllabus_name: string;
  total_items:   number;
  studied_items: number;
  overall_pct:   number;
  sections:      CoverageSection[];
}

interface DueTopic {
  id:               number;
  name:             string;
  subject_id:       number;
  subject_name:     string;
  next_review:      string;
  sm2_interval:     number;
  confidence_score: number;
}

interface FatesViewProps {
  authToken:       string;
  /** Navigate to Trials with the given topic pre-filled. */
  onBeginReview?:  (topicName: string, subjectId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  critical: "var(--red, #c0392b)",
  weak:     "var(--gold-bright, #e8c96a)",
  moderate: "var(--green, #6ab87a)",
  strong:   "var(--text-dim, #888)",
};

function ReadinessBar({ value, priority }: { value: number; priority: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
      <div style={{
        flex: 1, height: 4,
        background: "var(--stone-3)",
        borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          width:      `${value}%`,
          height:     "100%",
          background: PRIORITY_COLOR[priority] ?? "var(--green)",
          transition: "width 0.5s",
        }} />
      </div>
      <span style={{
        fontFamily: "var(--font-header)", fontSize: 9,
        letterSpacing: "0.08em", color: PRIORITY_COLOR[priority],
        minWidth: 28, textAlign: "right",
      }}>
        {Math.round(value)}%
      </span>
    </div>
  );
}

function SectionDivider({ title }: { title: string }) {
  return (
    <div style={{ padding: "18px 0 8px" }}>
      <div style={{
        fontFamily: "var(--font-header)", fontSize: 9,
        letterSpacing: "0.2em", textTransform: "uppercase",
        color: "var(--gold-dim)", marginBottom: 6,
      }}>{title}</div>
      <div style={{
        height: 1,
        background: "linear-gradient(90deg, var(--gold-dim) 0%, transparent 60%)",
        opacity: 0.4,
      }} />
    </div>
  );
}

// ── Syllabus Import Modal ─────────────────────────────────────────────────────

interface ImportModalProps {
  authToken:  string;
  onClose:    () => void;
  onImported: () => void;
}

function ImportModal({ authToken, onClose, onImported }: ImportModalProps) {
  const [step,      setStep]      = useState<"name" | "paste">("name");
  const [name,      setName]      = useState("");
  const [board,     setBoard]     = useState("");
  const [level,     setLevel]     = useState("");
  const [text,      setText]      = useState("");
  const [syllabusId, setSyllabusId] = useState<number | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  const createSyllabus = async () => {
    if (!name.trim()) { setError("Give the syllabus a name."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_SYLLABUS}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name: name.trim(), exam_board: board, level }),
      });
      if (!res.ok) throw new Error("Failed to create syllabus.");
      const data = await res.json() as { id: number };
      setSyllabusId(data.id);
      setStep("paste");
    } catch (e: unknown) { setError(String(e)); }
    finally { setLoading(false); }
  };

  const importItems = async () => {
    if (!syllabusId || !text.trim()) { setError("Paste some syllabus content first."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_SYLLABUS}/${syllabusId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error("Import failed.");
      onImported();
      onClose();
    } catch (e: unknown) { setError(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "var(--stone-1)", border: "1px solid var(--gold-dark)",
        width: 520, maxHeight: "80vh", overflowY: "auto",
        padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16,
      }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "var(--font-header)", fontSize: 13, letterSpacing: "0.12em", color: "var(--gold-bright)" }}>
            ᚾ IMPORT SYLLABUS
          </div>
          <button style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 14 }} onClick={onClose}>✕</button>
        </div>
        <div style={{ height: 1, background: "var(--gold-dark)", opacity: 0.4 }} />

        {step === "name" && (
          <>
            <div style={S.label}>Syllabus name *</div>
            <input
              style={S.input}
              placeholder="e.g. A-Level Chemistry 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Exam board</div>
                <input style={S.input} placeholder="e.g. AQA" value={board} onChange={(e) => setBoard(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={S.label}>Level</div>
                <input style={S.input} placeholder="e.g. A-Level" value={level} onChange={(e) => setLevel(e.target.value)} />
              </div>
            </div>
          </>
        )}

        {step === "paste" && (
          <>
            <div style={S.label}>Paste syllabus content</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Lines starting with <code style={{ color: "var(--gold-dim)" }}>#</code> become section headers.
              All other lines become topic entries.
            </div>
            <pre style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-dim)", background: "var(--stone-2)", padding: "8px 10px", lineHeight: 1.5 }}>
{`# Organic Chemistry
Alkanes and alkenes
Functional groups
Reaction mechanisms

# Physical Chemistry
Thermodynamics
Equilibrium`}
            </pre>
            <textarea
              style={{ ...S.input, height: 220, resize: "vertical", fontFamily: "monospace", fontSize: 12, lineHeight: 1.5 }}
              placeholder="# Section name&#10;Topic one&#10;Topic two"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
          </>
        )}

        {error && (
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "#c0392b" }}>{error}</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={S.btnSecondary} onClick={onClose}>Cancel</button>
          {step === "name" && (
            <button style={S.btnPrimary} onClick={createSyllabus} disabled={loading}>
              {loading ? "Creating…" : "Next →"}
            </button>
          )}
          {step === "paste" && (
            <>
              <button style={S.btnSecondary} onClick={() => setStep("name")}>← Back</button>
              <button style={S.btnPrimary} onClick={importItems} disabled={loading}>
                {loading ? "Importing…" : "Import"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────

export default function FatesView({ authToken, onBeginReview }: FatesViewProps) {
  const [schedule,   setSchedule]   = useState<ScheduleDay[]>([]);
  const [readiness,  setReadiness]  = useState<ReadinessTopic[]>([]);
  const [dueTopics,  setDueTopics]  = useState<DueTopic[]>([]);
  const [syllabi,    setSyllabi]    = useState<SyllabusRow[]>([]);
  const [coverage,   setCoverage]   = useState<Coverage | null>(null);
  const [activeSyl,  setActiveSyl]  = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [loading,    setLoading]    = useState(true);

  const headers = { Authorization: `Bearer ${authToken}` };

  const loadSchedule = useCallback(async () => {
    try {
      const [schedRes, readRes, dueRes] = await Promise.all([
        fetch(`${API_PROGRESS}/schedule`, { headers }),
        fetch(`${API_PROGRESS}/readiness`, { headers }),
        fetch(`${API_PROGRESS}/due`,       { headers }),
      ]);
      if (schedRes.ok) setSchedule(await schedRes.json() as ScheduleDay[]);
      if (readRes.ok)  setReadiness(await readRes.json() as ReadinessTopic[]);
      if (dueRes.ok)   setDueTopics(await dueRes.json() as DueTopic[]);
    } catch { /* backend offline */ }
  }, [authToken]);

  const loadSyllabi = useCallback(async () => {
    try {
      const res = await fetch(`${API_SYLLABUS}/`, { headers });
      if (res.ok) {
        const data = await res.json() as SyllabusRow[];
        setSyllabi(data);
        if (data.length > 0 && !activeSyl) setActiveSyl(data[0].id);
      }
    } catch { /* silent */ }
  }, [authToken]);

  const loadCoverage = useCallback(async (syllabusId: number) => {
    try {
      const res = await fetch(`${API_SYLLABUS}/${syllabusId}/coverage`, { headers });
      if (res.ok) setCoverage(await res.json() as Coverage);
    } catch { /* silent */ }
  }, [authToken]);

  useEffect(() => {
    Promise.all([loadSchedule(), loadSyllabi()]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeSyl) loadCoverage(activeSyl);
  }, [activeSyl]);

  const handleDeleteSyllabus = async (id: number) => {
    await fetch(`${API_SYLLABUS}/${id}`, { method: "DELETE", headers });
    setSyllabi((prev) => prev.filter((s) => s.id !== id));
    if (activeSyl === id) {
      const remaining = syllabi.filter((s) => s.id !== id);
      setActiveSyl(remaining.length > 0 ? remaining[0].id : null);
      setCoverage(null);
    }
  };

  // Today's tasks = day[0] of schedule (tomorrow in the API = first study day)
  const todayTasks = schedule[0]?.topics ?? [];
  const overdue    = readiness.filter((r) => r.priority === "critical");

  return (
    <div style={S.page} className="scroll-area">

      {/* ── Header ── */}
      <div style={S.pageHeader}>
        <span style={S.headerRune}>ᚾ</span>
        <div>
          <div style={S.headerTitle}>The Fates</div>
          <div style={S.headerSub}>Your study plan, schedule & syllabus coverage</div>
        </div>
        <button style={S.importBtn} onClick={() => setShowImport(true)}>
          + Import Syllabus
        </button>
      </div>
      <div style={S.engraving} />

      {loading && <div style={S.dimText}>Consulting the Norns…</div>}

      {!loading && (
        <>
          {/* ── Due for Review ── */}
          {dueTopics.length > 0 && (
            <>
              <SectionDivider title={`Due for Review — ${dueTopics.length} topic${dueTopics.length !== 1 ? "s" : ""}`} />
              <div style={S.dueGrid}>
                {dueTopics.map((t) => (
                  <div key={t.id} style={S.dueCard}>
                    <div style={S.dueDot} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.taskName}>{t.name}</div>
                      <div style={S.taskSubject}>{t.subject_name}</div>
                    </div>
                    <div style={S.dueInterval}>
                      {t.sm2_interval}d interval
                    </div>
                    {onBeginReview && (
                      <button
                        style={S.reviewBtn}
                        onClick={() => onBeginReview(t.name, String(t.subject_id))}
                        title={`Review ${t.name}`}
                      >
                        Review →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Today's Tasks ── */}
          <SectionDivider title="Today's Focus" />
          {todayTasks.length === 0 ? (
            <div style={S.emptyHint}>
              No topics tracked yet. Add subjects and take a quiz to populate your schedule.
            </div>
          ) : (
            <div style={S.cardGrid}>
              {todayTasks.map((t, i) => (
                <div key={i} style={{ ...S.taskCard, borderColor: PRIORITY_COLOR[t.priority] }}>
                  <div style={{ ...S.priorityDot, background: PRIORITY_COLOR[t.priority] }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.taskName}>{t.name}</div>
                    <div style={S.taskSubject}>{t.subject}</div>
                  </div>
                  <ReadinessBar value={t.readiness} priority={t.priority} />
                </div>
              ))}
            </div>
          )}

          {/* ── Overdue Topics ── */}
          {overdue.length > 0 && (
            <>
              <SectionDivider title={`Overdue — ${overdue.length} critical`} />
              <div style={S.overdueList}>
                {overdue.slice(0, 8).map((t, i) => (
                  <div key={i} style={S.overdueRow}>
                    <span style={{ ...S.overdueLabel, color: PRIORITY_COLOR["critical"] }}>!</span>
                    <span style={S.taskName}>{t.topic}</span>
                    <ReadinessBar value={t.readiness} priority="critical" />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── 7-Day Schedule ── */}
          <SectionDivider title="7-Day Schedule" />
          {schedule.length === 0 ? (
            <div style={S.emptyHint}>Study some topics to generate a personalised schedule.</div>
          ) : (
            <div style={S.scheduleGrid}>
              {schedule.map((day) => (
                <div key={day.date} style={S.dayCard}>
                  <div style={S.dayLabel}>
                    {day.day_label}
                    {day.days_until_exam !== null && (
                      <span style={S.examBadge}>-{day.days_until_exam}d</span>
                    )}
                  </div>
                  <div style={S.dayDate}>{new Date(day.date).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
                    {day.topics.map((t, i) => (
                      <div key={i} style={S.scheduleTopicRow}>
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: PRIORITY_COLOR[t.priority],
                          flexShrink: 0, display: "inline-block",
                        }} />
                        <span style={S.scheduleTopicName} title={t.name}>{t.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Syllabus Coverage ── */}
          <SectionDivider title="Syllabus Coverage" />

          {syllabi.length === 0 ? (
            <div style={S.emptyHint}>
              No syllabi imported yet.{" "}
              <button style={S.linkBtn} onClick={() => setShowImport(true)}>Import one now →</button>
            </div>
          ) : (
            <>
              {/* Syllabus tabs */}
              <div style={S.sylTabs}>
                {syllabi.map((s) => (
                  <button
                    key={s.id}
                    style={{
                      ...S.sylTab,
                      borderBottom: activeSyl === s.id ? "2px solid var(--gold-bright)" : "2px solid transparent",
                      color: activeSyl === s.id ? "var(--gold-bright)" : "var(--text-dim)",
                    }}
                    onClick={() => setActiveSyl(s.id)}
                  >
                    {s.name}
                    <span style={S.itemCount}>{s.item_count}</span>
                  </button>
                ))}
              </div>

              {coverage && (
                <div style={S.coverageBlock}>
                  {/* Overall bar */}
                  <div style={S.overallRow}>
                    <span style={S.coverageLabel}>Overall coverage</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...S.coverageTrack }}>
                        <div style={{
                          width: `${coverage.overall_pct}%`,
                          height: "100%",
                          background: coverage.overall_pct >= 80
                            ? "var(--green)"
                            : coverage.overall_pct >= 50
                              ? "var(--gold-bright)"
                              : "var(--red, #c0392b)",
                          transition: "width 0.5s",
                        }} />
                      </div>
                    </div>
                    <span style={S.pctLabel}>{coverage.studied_items}/{coverage.total_items} ({coverage.overall_pct}%)</span>
                    <button
                      style={{ ...S.linkBtn, marginLeft: 12, color: "#c0392b" }}
                      onClick={() => handleDeleteSyllabus(coverage.syllabus_id)}
                      title="Delete this syllabus"
                    >
                      Delete
                    </button>
                  </div>

                  {/* Per-section rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    {coverage.sections.map((sec) => (
                      <div key={sec.section} style={S.sectionRow}>
                        <span style={S.sectionName}>{sec.section || "General"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={S.coverageTrack}>
                            <div style={{
                              width: `${sec.coverage_pct}%`,
                              height: "100%",
                              background: sec.coverage_pct >= 80
                                ? "var(--green)"
                                : sec.coverage_pct >= 50
                                  ? "var(--gold-bright)"
                                  : "#c0392b",
                              transition: "width 0.5s",
                            }} />
                          </div>
                        </div>
                        <span style={S.pctLabel}>{sec.studied}/{sec.total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {showImport && (
        <ImportModal
          authToken={authToken}
          onClose={() => setShowImport(false)}
          onImported={() => { loadSyllabi(); }}
        />
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:           { flex: 1, minHeight: 0, padding: "16px 20px 32px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 },
  pageHeader:     { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  headerRune:     { fontFamily: "var(--font-header)", fontSize: 24, color: "var(--gold-dim)", lineHeight: 1 },
  headerTitle:    { fontFamily: "var(--font-header)", fontSize: 14, fontWeight: 700, letterSpacing: "0.1em", color: "var(--gold-bright)" },
  headerSub:      { fontFamily: "var(--font-body)", fontSize: 11, fontStyle: "italic", color: "var(--text-dim)", marginTop: 2 },
  engraving:      { height: 1, background: "linear-gradient(90deg, transparent, var(--gold-dim) 30%, var(--gold-dim) 70%, transparent)", opacity: 0.4, margin: "10px 0 4px" },
  dimText:        { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", padding: "8px 0" },
  emptyHint:      { fontFamily: "var(--font-body)", fontSize: 12, fontStyle: "italic", color: "var(--text-dim)", padding: "6px 0 10px" },

  dueGrid:        { display: "flex", flexDirection: "column", gap: 5 },
  dueCard:        { display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", background: "var(--stone-2)", borderLeft: "2px solid var(--gold)", borderTop: "none", borderRight: "none", borderBottom: "none" },
  dueDot:         { width: 7, height: 7, borderRadius: "50%", background: "var(--gold-bright)", flexShrink: 0 },
  dueInterval:    { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.06em", color: "var(--text-dim)", flexShrink: 0 },
  reviewBtn:      { background: "var(--gold-dark)", border: "1px solid var(--gold-dim)", color: "var(--gold-bright)", fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.1em", padding: "4px 10px", cursor: "pointer", flexShrink: 0, transition: "border-color 0.15s, background 0.15s" },

  cardGrid:       { display: "flex", flexDirection: "column", gap: 6 },
  taskCard:       { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--stone-2)", borderLeft: "2px solid var(--green)", borderTop: "none", borderRight: "none", borderBottom: "none" },
  priorityDot:    { width: 7, height: 7, borderRadius: "50%", flexShrink: 0 },
  taskName:       { fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  taskSubject:    { fontFamily: "var(--font-header)", fontSize: 9, letterSpacing: "0.08em", color: "var(--text-dim)", textTransform: "uppercase" as const },

  overdueList:    { display: "flex", flexDirection: "column", gap: 4 },
  overdueRow:     { display: "flex", alignItems: "center", gap: 10, padding: "5px 10px", background: "rgba(192,57,43,0.08)", borderLeft: "2px solid #c0392b" },
  overdueLabel:   { fontFamily: "var(--font-header)", fontSize: 12, fontWeight: 700, flexShrink: 0 },

  scheduleGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 },
  dayCard:        { background: "var(--stone-2)", border: "1px solid var(--stone-3)", padding: "10px 12px" },
  dayLabel:       { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", color: "var(--gold-dim)", display: "flex", justifyContent: "space-between" },
  dayDate:        { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-dim)", marginTop: 2 },
  examBadge:      { fontFamily: "var(--font-header)", fontSize: 9, color: "#c0392b", letterSpacing: "0.06em" },
  scheduleTopicRow: { display: "flex", alignItems: "center", gap: 6 },
  scheduleTopicName: { fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 },

  sylTabs:        { display: "flex", gap: 0, borderBottom: "1px solid var(--stone-3)", marginBottom: 12, overflowX: "auto" },
  sylTab:         { background: "none", border: "none", padding: "6px 14px", cursor: "pointer", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, transition: "color 0.15s", whiteSpace: "nowrap" },
  itemCount:      { marginLeft: 6, fontFamily: "var(--font-header)", fontSize: 9, color: "var(--text-dim)" },

  coverageBlock:  { padding: "4px 0 16px" },
  overallRow:     { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  coverageLabel:  { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.08em", color: "var(--text-dim)", minWidth: 120 },
  coverageTrack:  { height: 6, background: "var(--stone-3)", borderRadius: 3, overflow: "hidden" },
  pctLabel:       { fontFamily: "var(--font-header)", fontSize: 9, color: "var(--text-dim)", minWidth: 80, textAlign: "right" as const },
  sectionRow:     { display: "flex", alignItems: "center", gap: 10 },
  sectionName:    { fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", minWidth: 160, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },

  importBtn:      { marginLeft: "auto", background: "none", border: "1px solid var(--gold-dark)", color: "var(--gold-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", padding: "5px 12px", cursor: "pointer", transition: "border-color 0.15s, color 0.15s" },
  linkBtn:        { background: "none", border: "none", color: "var(--gold-dim)", fontFamily: "var(--font-body)", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 },

  // Import modal
  label:          { fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", color: "var(--text-dim)", textTransform: "uppercase" as const, marginBottom: 4 },
  input:          { width: "100%", background: "var(--stone-2)", border: "1px solid var(--stone-4)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 13, padding: "7px 10px", outline: "none", boxSizing: "border-box" as const },
  btnPrimary:     { background: "var(--gold-dark)", border: "1px solid var(--gold)", color: "var(--stone-0)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", padding: "7px 16px", cursor: "pointer" },
  btnSecondary:   { background: "none", border: "1px solid var(--stone-4)", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 10, letterSpacing: "0.1em", padding: "7px 16px", cursor: "pointer" },
};
