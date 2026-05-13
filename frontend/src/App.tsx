import { useState, useRef, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Chat from "@/components/Chat";
import InputZone from "@/components/InputZone";
import RightPanel from "@/components/RightPanel";
import { useWebSocket } from "@/hooks/useWebSocket";
import type { QuizQuestion } from "@/components/Quiz";

// ── Types ──────────────────────────────────────────────────
export type NavView = "oracle" | "trials" | "reckoning" | "chronicle" | "scrolls";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  quizData?: QuizQuestion[];      // set when tool returned quiz JSON
  flashcardData?: { front: string; back: string }[];
}

export interface Subject {
  id: string;
  name: string;
  color: string;
}

// ── App ────────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState<NavView>("oracle");
  const [messages, setMessages]   = useState<Message[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [subjects, setSubjects]   = useState<Subject[]>([
    { id: "1", name: "Machine Learning", color: "#6ab87a" },
    { id: "2", name: "DBMS",             color: "#c9a84c" },
    { id: "3", name: "Algorithms",       color: "#7aaa84" },
  ]);

  // Track the id of the currently-streaming assistant message
  const streamingId = useRef<string | null>(null);

  // ── WebSocket callbacks ───────────────────────────────────
  const onToken = useCallback((token: string) => {
    setMessages((prev) => {
      if (streamingId.current) {
        // Append token to the streaming message
        return prev.map((m) =>
          m.id === streamingId.current
            ? { ...m, content: m.content + token }
            : m
        );
      } else {
        // First token — create the assistant message
        const id = `assistant-${Date.now()}`;
        streamingId.current = id;
        return [
          ...prev,
          { id, role: "assistant", content: token, timestamp: new Date() },
        ];
      }
    });
  }, []);

  const onDone = useCallback(() => {
    streamingId.current = null;
  }, []);

  const onToolData = useCallback((data: unknown) => {
    // Attach structured data (quiz / flashcards) to the last assistant message
    setMessages((prev) => {
      const lastIdx = prev.findLastIndex((m) => m.role === "assistant");
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

  const { sendMessage, isConnected } = useWebSocket({ onToken, onDone, onToolData });

  // ── Handlers ──────────────────────────────────────────────
  const handleSend = (text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [
      ...prev,
      {
        id:        `user-${Date.now()}`,
        role:      "user",
        content:   text.trim(),
        timestamp: new Date(),
      },
    ]);
    sendMessage(text.trim(), activeSubject ? Number(activeSubject) : undefined);
  };

  const handleTrial = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    const topic = subj ? `Quiz me on ${subj.name}` : "Quiz me on the topic we last discussed";
    handleSend(topic);
  };

  const handleRunes = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    const topic = subj ? subj.name : "the topic we last discussed";
    handleSend(`Generate flashcards for ${topic}`);
  };

  const handleFates = () => {
    const subj = subjects.find((s) => s.id === activeSubject);
    const topic = subj ? subj.name : "my subjects";
    handleSend(`Build a revision schedule for ${topic}`);
  };

  const handleAddSubject = (name: string) => {
    const colors = ["#6ab87a", "#c9a84c", "#7aaa84", "#e8c96a", "#4a8a5a"];
    setSubjects((prev) => [
      ...prev,
      {
        id:    Date.now().toString(),
        name,
        color: colors[prev.length % colors.length],
      },
    ]);
  };

  // ── Placeholder views ─────────────────────────────────────
  const Placeholder = ({ rune, label }: { rune: string; label: string }) => (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.12em" }}>
      {rune}  {label}
    </div>
  );

  return (
    <div className="app-shell">
      <Sidebar
        view={view}
        onViewChange={setView}
        subjects={subjects}
        activeSubject={activeSubject}
        onSubjectChange={setActiveSubject}
        onAddSubject={handleAddSubject}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar view={view} isConnected={isConnected} />

        {view === "oracle" && (
          <>
            <Chat messages={messages} />
            <InputZone
              onSend={handleSend}
              onTrial={handleTrial}
              onRunes={handleRunes}
              onFates={handleFates}
              activeSubjectName={subjects.find((s) => s.id === activeSubject)?.name ?? null}
            />
          </>
        )}
        {view === "trials"    && <Placeholder rune="ᛏ" label="TRIALS — Select a discipline and begin your trial" />}
        {view === "reckoning" && <Placeholder rune="ᚢ" label="THE RECKONING — Progress dashboard coming soon" />}
        {view === "chronicle" && <Placeholder rune="ᛊ" label="CHRONICLE — Conversation history coming soon" />}
        {view === "scrolls"   && <Placeholder rune="ᚱ" label="SCROLLS — Uploaded files coming soon" />}
      </main>

      <RightPanel activeSubject={subjects.find((s) => s.id === activeSubject)} />
    </div>
  );
}
