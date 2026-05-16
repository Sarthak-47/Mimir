import { useState, useRef, useCallback, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Chat from "@/components/Chat";
import InputZone from "@/components/InputZone";
import RightPanel from "@/components/RightPanel";
import Auth from "@/components/Auth";
import TrialsView from "@/views/TrialsView";
import ReckoningView from "@/views/ReckoningView";
import ChronicleView from "@/views/ChronicleView";
import ScrollsView from "@/views/ScrollsView";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { QuizQuestion } from "@/components/Quiz";
import { API_BASE as API } from "@/config";

/**
 * Full-screen loading screen displayed while the FastAPI backend is starting up.
 *
 * Shows the eye-in-diamond logo and an animated dot ellipsis. The parent
 * polls `/health` every 500 ms for up to 20 s; once the backend responds the
 * splash unmounts and the auth gate renders.
 *
 * @param dots - Number of elapsed half-second ticks, used to cycle the ellipsis.
 */
function BootSplash({ dots }: { dots: number }) {
  const d = ".".repeat((dots % 3) + 1).padEnd(3, " ");
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--stone-0)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 20,
    }}>
      {/* Eye-in-diamond mark */}
      <svg width="64" height="64" viewBox="0 0 36 36" fill="none">
        <path d="M18 2 L34 18 L18 34 L2 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
        <line x1="18" y1="2"  x2="18" y2="6"  stroke="#c9a84c" strokeWidth="1" />
        <line x1="34" y1="18" x2="30" y2="18" stroke="#c9a84c" strokeWidth="1" />
        <line x1="18" y1="34" x2="18" y2="30" stroke="#c9a84c" strokeWidth="1" />
        <line x1="2"  y1="18" x2="6"  y2="18" stroke="#c9a84c" strokeWidth="1" />
        <path d="M10 18 Q18 11 26 18 Q18 25 10 18 Z" stroke="#c9a84c" strokeWidth="1" fill="none" />
        <circle cx="18" cy="18" r="3.5" stroke="#c9a84c" strokeWidth="1" fill="none" />
        <circle cx="18" cy="18" r="1.5" fill="#c9a84c" />
      </svg>
      <div style={{
        fontFamily: "var(--font-header)",
        fontSize: 11,
        letterSpacing: "0.22em",
        color: "var(--gold-dim)",
        textTransform: "uppercase",
      }}>
        Awakening Mimir{d}
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────
export type NavView = "oracle" | "trials" | "reckoning" | "chronicle" | "scrolls";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  quizData?: QuizQuestion[];
  flashcardData?: { front: string; back: string }[];
}

export interface Subject {
  id: string;
  name: string;
  color: string;
}

// ── Constants ──────────────────────────────────────────────
const STORAGE_TOKEN     = "mimir_token";
const STORAGE_USERNAME  = "mimir_username";
const STORAGE_EXAM_DATE = "mimir_exam_date";
const SUBJECT_COLORS    = ["#6ab87a", "#c9a84c", "#7aaa84", "#e8c96a", "#4a8a5a"];

/** Read persisted JWT and username from localStorage, or return null if absent. */
function readStoredAuth(): { token: string; username: string } | null {
  try {
    const token    = localStorage.getItem(STORAGE_TOKEN);
    const username = localStorage.getItem(STORAGE_USERNAME);
    if (token && username) return { token, username };
  } catch { /* private browsing */ }
  return null;
}

/** Build an Authorization Bearer header object from a JWT string. */
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Root application component.
 *
 * Renders one of three top-level states:
 * 1. `BootSplash` — while polling the backend health endpoint on startup.
 * 2. `Auth`       — when no valid JWT is present in localStorage.
 * 3. Main shell   — `Sidebar`, `Topbar`, active view, and `RightPanel`.
 *
 * Manages all shared state: auth token, active view/subject, chat messages,
 * subject list, exam date, and WebSocket callbacks. Passes data and handlers
 * down to child components via props.
 */
export default function App() {
  // ── Backend readiness ─────────────────────────────────
  // Uvicorn takes ~2-4 s to start. Poll /health before rendering the
  // auth screen so the user never sees a "backend not running" error.
  const [backendReady, setBackendReady] = useState(false);
  const [bootDots,     setBootDots]     = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = setInterval(() => setBootDots((d) => d + 1), 500);

    const poll = async () => {
      for (let i = 0; i < 40; i++) {         // up to 20 s
        if (!alive) return;
        try {
          const ctrl = new AbortController();
          const tid  = setTimeout(() => ctrl.abort(), 800);
          const res  = await fetch(`${API}/health`, { signal: ctrl.signal });
          clearTimeout(tid);
          if (res.ok) {
            if (alive) setBackendReady(true);
            return;
          }
        } catch { /* not ready yet */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      // Timed out — show UI anyway; user will see error on submit if still down
      if (alive) setBackendReady(true);
    };

    poll();
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, []);

  // ── State ─────────────────────────────────────────────
  const stored = readStoredAuth();
  const [authToken, setAuthToken]         = useState<string | null>(stored?.token ?? null);
  const [username, setUsername]           = useState<string>(stored?.username ?? "");
  const [view, setView]                   = useState<NavView>("oracle");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [subjects, setSubjects]           = useState<Subject[]>([]);
  const [reviewAlert, setReviewAlert]     = useState<{ topics: string[]; count: number } | null>(null);
  const [mode, setMode]                   = useState<string>("detailed");
  const [examDate, setExamDate]           = useState<Date | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_EXAM_DATE);
      return stored ? new Date(stored) : null;
    } catch { return null; }
  });
  // ── Auth handlers ──────────────────────────────────────
  const handleAuthenticated = useCallback((token: string, user: string) => {
    try {
      localStorage.setItem(STORAGE_TOKEN,    token);
      localStorage.setItem(STORAGE_USERNAME, user);
    } catch { /* ignore */ }
    setAuthToken(token);
    setUsername(user);
  }, []);

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_TOKEN);
      localStorage.removeItem(STORAGE_USERNAME);
    } catch { /* ignore */ }
    setAuthToken(null);
    setUsername("");
    setMessages([]);
    setSubjects([]);
    setActiveSubject(null);
  }, []);

  // ── Fetch subjects on auth ─────────────────────────────
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/api/progress/subjects`, { headers: authHeaders(authToken) })
      .then((r) => r.ok ? r.json() : [])
      .then((data: { id: number; name: string; color: string }[]) => {
        setSubjects(data.map((s) => ({ id: String(s.id), name: s.name, color: s.color })));
      })
      .catch(() => { /* backend offline — subjects stay empty */ });
  }, [authToken]);

  // ── Fetch exam date from API on auth ───────────────────
  useEffect(() => {
    if (!authToken) return;
    fetch(`${API}/api/users/me`, { headers: authHeaders(authToken) })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { exam_date?: string } | null) => {
        if (data?.exam_date) {
          const d = new Date(data.exam_date);
          setExamDate(d);
          try { localStorage.setItem(STORAGE_EXAM_DATE, d.toISOString()); } catch { /**/ }
        }
      })
      .catch(() => { /* use localStorage value */ });
  }, [authToken]);

  // ── Subject CRUD ───────────────────────────────────────
  const handleAddSubject = useCallback(async (name: string) => {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    try {
      const res = await fetch(`${API}/api/progress/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(authToken!) },
        body: JSON.stringify({ name, color }),
      });
      if (res.ok) {
        const s = await res.json() as { id: number; name: string; color: string };
        setSubjects((prev) => [...prev, { id: String(s.id), name: s.name, color: s.color }]);
        return;
      }
    } catch { /* fall through */ }
    // Offline fallback — use a local id
    setSubjects((prev) => [...prev, { id: `local-${Date.now()}`, name, color }]);
  }, [authToken, subjects.length]);

  const handleDeleteSubject = useCallback(async (id: string) => {
    if (!id.startsWith("local-")) {
      try {
        await fetch(`${API}/api/progress/subjects/${id}`, {
          method: "DELETE",
          headers: authHeaders(authToken!),
        });
      } catch { /* ignore */ }
    }
    setSubjects((prev) => prev.filter((s) => s.id !== id));
    setActiveSubject((cur) => (cur === id ? null : cur));
  }, [authToken]);

  // ── Exam date handler ──────────────────────────────────
  const handleSetExamDate = useCallback(async (d: Date | null) => {
    setExamDate(d);
    try {
      if (d) localStorage.setItem(STORAGE_EXAM_DATE, d.toISOString());
      else   localStorage.removeItem(STORAGE_EXAM_DATE);
    } catch { /* ignore */ }
    // Persist to backend (best-effort)
    if (authToken) {
      fetch(`${API}/api/users/exam-date`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders(authToken) },
        body: JSON.stringify({ exam_date: d ? d.toISOString().split("T")[0] : null }),
      }).catch(() => { /* ignore */ });
    }
  }, [authToken]);

  // ── WebSocket streaming ────────────────────────────────
  const streamingId = useRef<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(false);

  const onToken = useCallback((token: string) => {
    setIsWaiting(false);
    setMessages((prev) => {
      if (streamingId.current) {
        return prev.map((m) =>
          m.id === streamingId.current ? { ...m, content: m.content + token } : m
        );
      } else {
        const id = `assistant-${Date.now()}`;
        streamingId.current = id;
        return [...prev, { id, role: "assistant", content: token, timestamp: new Date() }];
      }
    });
  }, []);

  const onDone = useCallback(() => { setIsWaiting(false); streamingId.current = null; }, []);

  const onReviewReminder = useCallback((topics: string[], count: number) => {
    setReviewAlert({ topics, count });
  }, []);

  const onToolData = useCallback((data: unknown) => {
    setMessages((prev) => {
      const lastIdx = (() => { for (let i = prev.length - 1; i >= 0; i--) if (prev[i].role === "assistant") return i; return -1; })();
      if (lastIdx === -1) return prev;
      const updated = [...prev];
      const target  = { ...updated[lastIdx] };
      if (Array.isArray(data) && data.length > 0) {
        if ("question" in (data[0] as object)) {
          target.quizData = data as QuizQuestion[];
        } else if ("front" in (data[0] as object)) {
          target.flashcardData = data as { front: string; back: string }[];
        }
      }
      updated[lastIdx] = target;
      return updated;
    });
  }, []);

  const { sendMessage, isConnected, isConnecting } = useWebSocket({ onToken, onDone, onToolData, onReviewReminder, authToken });

  // ── Chat handlers ──────────────────────────────────────
  const handleSend = (text: string, sendMode?: string) => {
    if (!text.trim()) return;
    setIsWaiting(true);
    setMessages((prev) => [...prev, {
      id:        `user-${Date.now()}`,
      role:      "user",
      content:   text.trim(),
      timestamp: new Date(),
    }]);
    sendMessage(text.trim(), activeSubject ? Number(activeSubject) : undefined, sendMode ?? mode);
  };

  const handleTrial = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    handleSend(subj ? `Quiz me on ${subj.name}` : "Quiz me on the topic we last discussed");
  };

  const handleRunes = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    handleSend(`Generate flashcards for ${subj ? subj.name : "the topic we last discussed"}`);
  };

  const handleFates = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    handleSend(`Build a revision schedule for ${subj ? subj.name : "my subjects"}`);
  };

  // ── Boot gate — wait for uvicorn ──────────────────────
  if (!backendReady) {
    return <BootSplash dots={bootDots} />;
  }

  // ── Auth gate ──────────────────────────────────────────
  if (!authToken) {
    return <Auth onAuthenticated={handleAuthenticated} />;
  }

  const activeSubjectObj = subjects.find((s) => s.id === activeSubject);

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onViewChange={setView}
        subjects={subjects}
        activeSubject={activeSubject}
        onSubjectChange={setActiveSubject}
        onAddSubject={handleAddSubject}
        onDeleteSubject={handleDeleteSubject}
        username={username}
        examDate={examDate}
        onSetExamDate={handleSetExamDate}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar
          view={view}
          isConnected={isConnected}
          isConnecting={isConnecting}
          activeSubjectName={activeSubjectObj?.name ?? null}
          username={username}
          onLogout={handleLogout}
        />

        {/* ── Review reminder banner ── */}
        {reviewAlert && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 16px", background: "var(--stone-4)",
            borderBottom: "1px solid var(--gold-dim)", flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.1em", color: "var(--gold-bright)" }}>
              ᚾ &nbsp;{reviewAlert.count} topic{reviewAlert.count !== 1 ? "s" : ""} overdue for review
              {reviewAlert.topics.length > 0 && ` — ${reviewAlert.topics.slice(0, 3).join(", ")}`}
            </span>
            <button
              onClick={() => setReviewAlert(null)}
              style={{ background: "none", border: "none", color: "var(--gold-dim)", fontFamily: "var(--font-header)", fontSize: 13, cursor: "pointer", lineHeight: 1, padding: "0 0 0 12px" }}
            >×</button>
          </div>
        )}

        {view === "oracle" && (
          <>
            <Chat messages={messages} onSuggestion={handleSend} username={username} isWaiting={isWaiting} />
            <InputZone
              onSend={handleSend}
              onTrial={handleTrial}
              onRunes={handleRunes}
              onFates={handleFates}
              activeSubjectName={activeSubjectObj?.name ?? null}
              authToken={authToken}
              mode={mode}
              onModeChange={setMode}
            />
          </>
        )}

        {view === "trials" && (
          <TrialsView
            subjects={subjects}
            activeSubject={activeSubject}
            authToken={authToken}
          />
        )}

        {view === "reckoning" && (
          <ReckoningView
            subjects={subjects}
            authToken={authToken}
          />
        )}

        {view === "chronicle" && (
          <ChronicleView authToken={authToken} username={username} />
        )}

        {view === "scrolls" && (
          <ScrollsView
            subjects={subjects}
            authToken={authToken}
          />
        )}
      </main>

      <RightPanel
        activeSubject={activeSubjectObj}
        authToken={authToken}
        examDate={examDate}
        onSetExamDate={handleSetExamDate}
      />
    </div>
  );
}
