import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import Chat from "@/components/Chat";
import InputZone from "@/components/InputZone";
import RightPanel from "@/components/RightPanel";
import { useWebSocket } from "@/hooks/useWebSocket";

// ── Types ──────────────────────────────────────────────────
export type NavView = "oracle" | "trials" | "reckoning" | "chronicle" | "scrolls";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Subject {
  id: string;
  name: string;
  color: string;
}

// ── App ────────────────────────────────────────────────────
export default function App() {
  const [view, setView]               = useState<NavView>("oracle");
  const [messages, setMessages]       = useState<Message[]>([]);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [subjects, setSubjects]       = useState<Subject[]>([
    { id: "1", name: "Machine Learning", color: "#6ab87a" },
    { id: "2", name: "DBMS",             color: "#c9a84c" },
    { id: "3", name: "Algorithms",       color: "#7aaa84" },
  ]);

  const { sendMessage, isConnected } = useWebSocket({
    onMessage: (msg) => {
      setMessages((prev) => [
        ...prev,
        {
          id:        Date.now().toString(),
          role:      "assistant",
          content:   msg,
          timestamp: new Date(),
        },
      ]);
    },
  });

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id:        Date.now().toString(),
      role:      "user",
      content:   text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage(text.trim());
  };

  const handleAddSubject = (name: string) => {
    const colors = ["#6ab87a", "#c9a84c", "#7aaa84", "#e8c96a", "#4a8a5a"];
    setSubjects((prev) => [
      ...prev,
      { id: Date.now().toString(), name, color: colors[prev.length % colors.length] },
    ]);
  };

  return (
    <div className="app-shell">
      {/* ── LEFT SIDEBAR ── */}
      <Sidebar
        view={view}
        onViewChange={setView}
        subjects={subjects}
        activeSubject={activeSubject}
        onSubjectChange={setActiveSubject}
        onAddSubject={handleAddSubject}
      />

      {/* ── MAIN COLUMN ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Topbar view={view} isConnected={isConnected} />

        {view === "oracle" && (
          <>
            <Chat messages={messages} />
            <InputZone onSend={handleSend} activeSubject={activeSubject} />
          </>
        )}

        {view === "trials" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.12em" }}>
            ᛏ  TRIALS — Select a discipline and begin your trial
          </div>
        )}

        {view === "reckoning" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.12em" }}>
            ᚢ  THE RECKONING — Progress dashboard coming soon
          </div>
        )}

        {view === "chronicle" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.12em" }}>
            ᛊ  CHRONICLE — Conversation history coming soon
          </div>
        )}

        {view === "scrolls" && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "var(--font-header)", fontSize: 11, letterSpacing: "0.12em" }}>
            ᚱ  SCROLLS — Uploaded files coming soon
          </div>
        )}
      </main>

      {/* ── RIGHT PANEL ── */}
      <RightPanel activeSubject={subjects.find((s) => s.id === activeSubject)} />
    </div>
  );
}
