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

function readStoredAuth(): { token: string; username: string } | null {
  try {
    const token    = localStorage.getItem(STORAGE_TOKEN);
    const username = localStorage.getItem(STORAGE_USERNAME);
    if (token && username) return { token, username };
  } catch { /* private browsing */ }
  return null;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ── App ────────────────────────────────────────────────────
export default function App() {
  // ── State ─────────────────────────────────────────────
  const stored = readStoredAuth();
  const [authToken, setAuthToken]         = useState<string | null>(stored?.token ?? null);
  const [username, setUsername]           = useState<string>(stored?.username ?? "");
  const [view, setView]                   = useState<NavView>("oracle");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [subjects, setSubjects]           = useState<Subject[]>([]);
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

  const onToken = useCallback((token: string) => {
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

  const onDone = useCallback(() => { streamingId.current = null; }, []);

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

  const { sendMessage, isConnected } = useWebSocket({ onToken, onDone, onToolData, authToken });

  // ── Chat handlers ──────────────────────────────────────
  const handleSend = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, {
      id:        `user-${Date.now()}`,
      role:      "user",
      content:   text.trim(),
      timestamp: new Date(),
    }]);
    sendMessage(text.trim(), activeSubject ? Number(activeSubject) : undefined);
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
          activeSubjectName={activeSubjectObj?.name ?? null}
          username={username}
          onLogout={handleLogout}
        />

        {view === "oracle" && (
          <>
            <Chat messages={messages} />
            <InputZone
              onSend={handleSend}
              onTrial={handleTrial}
              onRunes={handleRunes}
              onFates={handleFates}
              activeSubjectName={activeSubjectObj?.name ?? null}
              authToken={authToken}
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
          <ChronicleView authToken={authToken} />
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
