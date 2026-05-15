import { useEffect, useRef, useState, useCallback } from "react";

import { WS_CHAT as WS_BASE_URL } from "@/config";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 15000;

// ── Types ───────────────────────────────────────────────────
export interface WsMessage {
  type: "token" | "done" | "tool_data" | "error" | "review_reminder";
  content?: string;
  data?: unknown;
  topics?: string[];
  count?: number;
}

interface UseWebSocketOptions {
  onToken:            (token: string) => void;   // streaming token received
  onDone:             () => void;                // assistant turn complete
  onToolData:         (data: unknown) => void;   // structured quiz / flashcard data
  onReviewReminder?:  (topics: string[], count: number) => void; // overdue topics
  authToken?: string | null;                     // JWT — appended as ?token= query param
}

interface UseWebSocketReturn {
  sendMessage: (text: string, subjectId?: number) => void;
  isConnected: boolean;
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
  useEffect(() => { onTokenRef.current          = onToken;          }, [onToken]);
  useEffect(() => { onDoneRef.current           = onDone;           }, [onDone]);
  useEffect(() => { onToolDataRef.current       = onToolData;       }, [onToolData]);
  useEffect(() => { onReviewReminderRef.current = onReviewReminder; }, [onReviewReminder]);

  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback((token?: string | null) => {
    if (wsRef.current) wsRef.current.close();

    const url = token ? `${WS_BASE_URL}?token=${encodeURIComponent(token)}` : WS_BASE_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCount.current = 0;
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
          case "review_reminder":
            onReviewReminderRef.current?.(msg.topics ?? [], msg.count ?? 0);
            break;
          case "error":
            console.error("[Mimir WS] Server error:", msg.content);
            break;
        }
      } catch {
        // Plain text fallback (shouldn't happen with proper backend)
        onTokenRef.current(event.data as string);
      }
    };

    ws.onerror = () => console.warn("[Mimir WS] Connection error");

    ws.onclose = () => {
      setIsConnected(false);
      console.log("[Mimir WS] Disconnected");

      reconnectCount.current += 1;
      const delay = Math.min(RECONNECT_DELAY_MS * reconnectCount.current, MAX_RECONNECT_DELAY_MS);
      reconnectTimer.current = setTimeout(() => connect(token), delay);
    };
  }, []);

  // Reconnect whenever the auth token changes
  useEffect(() => {
    reconnectCount.current = 0;
    connect(authToken);
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const sendMessage = useCallback((text: string, subjectId?: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ message: text, subject_id: subjectId ?? null })
      );
    } else {
      console.warn("[Mimir WS] Cannot send — not connected");
    }
  }, []);

  return { sendMessage, isConnected };
}
