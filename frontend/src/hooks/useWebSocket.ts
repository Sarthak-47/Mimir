/**
 * useWebSocket — persistent, auto-reconnecting WebSocket hook for the Mimir chat endpoint.
 *
 * Opens a single socket per auth token, multiplexes all backend message types
 * (token streams, tool data, review reminders, file-indexing events, tutor
 * state transitions), and reconnects automatically with linear back-off.
 *
 * Consumers receive typed callbacks rather than raw message events so
 * components stay decoupled from the wire protocol.
 *
 * @see {@link WsMessage} for the full discriminated union of server messages.
 * @see {@link UseWebSocketReturn} for the public surface returned by this hook.
 */

import { useEffect, useRef, useState, useCallback } from "react";

import { WS_CHAT as WS_BASE_URL } from "@/config";
const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 4000;

// ── Types ───────────────────────────────────────────────────
export interface WsMessage {
  type: "token" | "done" | "tool_data" | "error" | "review_reminder" | "tool_action" | "sources" | "ping" | "file_indexed" | "tutor_state" | "tutor_quiz";
  content?: string;
  data?: unknown;
  topics?: string[];
  count?: number;
  tool?: string;      // for tool_action
  file_id?: number;   // for file_indexed
  filename?: string;  // for file_indexed
  chunks?: number;    // for file_indexed
  state?: string;     // for tutor_state
}

interface UseWebSocketOptions {
  onToken:            (token: string) => void;   // streaming token received
  onDone:             () => void;                // assistant turn complete
  onToolData:         (data: unknown) => void;   // structured quiz / flashcard data
  onReviewReminder?:  (topics: string[], count: number) => void; // overdue topics
  onToolAction?:      (tool: string) => void;    // which tool the agent used
  onSources?:         (sources: string[]) => void; // source file names retrieved
  onFileIndexed?:     (filename: string, chunks: number) => void; // file indexing complete
  onTutorState?:      (state: string) => void;   // tutor session state changed
  onTutorQuiz?:       (data: unknown) => void;   // tutor quiz questions ready
  authToken?: string | null;                     // JWT — appended as ?token= query param
}

interface UseWebSocketReturn {
  sendMessage: (text: string, subjectId?: number, mode?: string, images?: string[], tutorSessionId?: number) => void;
  isConnected: boolean;
  isConnecting: boolean;
}

/**
 * Manage a persistent WebSocket connection to the Mimir chat endpoint.
 *
 * Opens the socket immediately using `authToken` as a `?token=` query param.
 * Reconnects automatically on close using exponential backoff (up to
 * `MAX_RECONNECT_ATTEMPTS`). Re-connects whenever `authToken` changes.
 *
 * Callback refs are kept fresh so callers can pass inline functions without
 * triggering reconnects.
 *
 * @param options.onToken           - Called with each streamed LLM token.
 * @param options.onDone            - Called when the assistant turn completes.
 * @param options.onToolData        - Called with structured quiz/flashcard data.
 * @param options.onReviewReminder  - Called when the server pushes overdue topics.
 * @param options.authToken         - JWT for authentication; null to skip auth.
 *
 * @returns `sendMessage` to dispatch a chat message and `isConnected` status flag.
 */
export function useWebSocket({
  onToken,
  onDone,
  onToolData,
  onReviewReminder,
  onToolAction,
  onSources,
  onFileIndexed,
  onTutorState,
  onTutorQuiz,
  authToken,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks fresh without recreating the socket
  const onTokenRef           = useRef(onToken);
  const onDoneRef            = useRef(onDone);
  const onToolDataRef        = useRef(onToolData);
  const onReviewReminderRef  = useRef(onReviewReminder);
  const onToolActionRef      = useRef(onToolAction);
  const onSourcesRef         = useRef(onSources);
  const onFileIndexedRef     = useRef(onFileIndexed);
  const onTutorStateRef      = useRef(onTutorState);
  const onTutorQuizRef       = useRef(onTutorQuiz);
  useEffect(() => { onTokenRef.current          = onToken;          }, [onToken]);
  useEffect(() => { onDoneRef.current           = onDone;           }, [onDone]);
  useEffect(() => { onToolDataRef.current       = onToolData;       }, [onToolData]);
  useEffect(() => { onReviewReminderRef.current = onReviewReminder; }, [onReviewReminder]);
  useEffect(() => { onToolActionRef.current     = onToolAction;     }, [onToolAction]);
  useEffect(() => { onSourcesRef.current        = onSources;        }, [onSources]);
  useEffect(() => { onFileIndexedRef.current    = onFileIndexed;    }, [onFileIndexed]);
  useEffect(() => { onTutorStateRef.current     = onTutorState;     }, [onTutorState]);
  useEffect(() => { onTutorQuizRef.current      = onTutorQuiz;      }, [onTutorQuiz]);

  const [isConnected, setIsConnected] = useState(false);
  // True until the socket has connected at least once (startup grace period).
  const [isConnecting, setIsConnecting] = useState(true);
  const everConnected = useRef(false);

  const connect = useCallback((token?: string | null) => {
    if (wsRef.current) wsRef.current.close();

    const url = token ? `${WS_BASE_URL}?token=${encodeURIComponent(token)}` : WS_BASE_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setIsConnecting(false);
      everConnected.current = true;
      reconnectCount.current = 0;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      console.log("[Mimir WS] Connected");
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;

        switch (msg.type) {
          case "token":
            if (msg.content) onTokenRef.current(msg.content);
            break;
          case "done":
            onDoneRef.current();
            break;
          case "tool_data":
            if (msg.data !== undefined) onToolDataRef.current(msg.data);
            break;
          case "tool_action":
            if (msg.tool) onToolActionRef.current?.(msg.tool);
            break;
          case "sources":
            if (Array.isArray(msg.data)) onSourcesRef.current?.(msg.data as string[]);
            break;
          case "review_reminder":
            onReviewReminderRef.current?.(msg.topics ?? [], msg.count ?? 0);
            // OS notification — request permission if needed, then fire
            if ("Notification" in window && Notification.permission !== "denied") {
              const topics = msg.topics ?? [];
              const count  = msg.count ?? 0;
              const body   = `${count} topic${count !== 1 ? "s" : ""} overdue`
                + (topics.length > 0 ? `: ${topics.slice(0, 3).join(", ")}` : "");
              const show = () => {
                try {
                  new Notification("Mimir — Time to Review", { body, icon: "/favicon.ico" });
                } catch { /* ignore — notifications blocked */ }
              };
              if (Notification.permission === "granted") {
                show();
              } else {
                Notification.requestPermission().then((p) => { if (p === "granted") show(); });
              }
            }
            break;
          case "file_indexed":
            onFileIndexedRef.current?.(msg.filename ?? "", msg.chunks ?? 0);
            break;
          case "tutor_state":
            if (msg.state) onTutorStateRef.current?.(msg.state);
            break;
          case "tutor_quiz":
            if (msg.data !== undefined) onTutorQuizRef.current?.(msg.data);
            break;
          case "error": {
            console.error("[Mimir WS] Server error:", msg.content);
            // Show a user-friendly error in the chat bubble instead of
            // silently swallowing it — the backend sends a "done" frame
            // immediately after, so the bubble completes cleanly.
            const raw = msg.content ?? "";
            let friendly: string;
            if (/connection refused|connect.*failed|ollama.*not.*run/i.test(raw)) {
              friendly = "⚠ Ollama is not running. Open a terminal and run:\n`ollama serve`";
            } else if (/model.*not.*found|no such model|pull.*model/i.test(raw)) {
              friendly = `⚠ Model not found. Pull it with:\n\`ollama pull qwen3.5:9b\``;
            } else if (/timeout|timed out/i.test(raw)) {
              friendly = "⚠ The oracle timed out — Ollama may be overloaded. Try again in a moment.";
            } else {
              friendly = `⚠ ${raw || "The oracle encountered an error — try again."}`;
            }
            onTokenRef.current(friendly);
            break;
          }
        }
      } catch {
        // Plain text fallback (shouldn't happen with proper backend)
        onTokenRef.current(event.data as string);
      }
    };

    ws.onerror = () => console.warn("[Mimir WS] Connection error");

    ws.onclose = (event: CloseEvent) => {
      setIsConnected(false);
      // Stay in "connecting" state if we haven't successfully connected yet
      if (!everConnected.current) setIsConnecting(true);
      console.log("[Mimir WS] Disconnected, code:", event.code);

      // 4001 = auth rejected by backend (accept → close 4001 path).
      // Only clear session when we actually had a token — if there's no token
      // we're already on the login screen and should not reload.
      if (event.code === 4001 && token) {
        console.warn("[Mimir WS] Auth rejected (4001) — clearing session");
        localStorage.clear();
        window.location.reload();
        return;
      }

      reconnectCount.current += 1;

      // NOTE: We intentionally do NOT clear the session on repeated network
      // failures — that only masked connectivity issues (e.g. slow localhost
      // in browser-extension contexts). The 4001 close code (above) is the
      // authoritative signal that a token is invalid.

      const delay = Math.min(RECONNECT_DELAY_MS * reconnectCount.current, MAX_RECONNECT_DELAY_MS);
      reconnectTimer.current = setTimeout(() => connect(token), delay);
    };
  }, []);

  // Reconnect whenever the auth token changes.
  // Skip entirely when there is no token — we're on the login screen and
  // attempting to connect without a token causes a 4001 close which clears
  // localStorage and reloads the page, creating an infinite refresh loop.
  useEffect(() => {
    if (!authToken) return;
    reconnectCount.current = 0;
    connect(authToken);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const sendMessage = useCallback((
    text: string,
    subjectId?: number,
    mode: string = "detailed",
    images?: string[],
    tutorSessionId?: number,
  ) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const payload: Record<string, unknown> = {
        message:    text,
        subject_id: subjectId ?? null,
        mode,
      };
      if (images && images.length > 0) payload.images = images;
      if (tutorSessionId) payload.tutor_session_id = tutorSessionId;
      wsRef.current.send(JSON.stringify(payload));
    } else {
      console.warn("[Mimir WS] Cannot send — not connected");
    }
  }, []);

  return { sendMessage, isConnected, isConnecting };
}
