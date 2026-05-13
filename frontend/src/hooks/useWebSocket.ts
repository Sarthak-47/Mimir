import { useEffect, useRef, useState, useCallback } from "react";

// ── Config ──────────────────────────────────────────────────
const WS_URL = "ws://localhost:8000/ws/chat";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ── Types ───────────────────────────────────────────────────
export interface WsMessage {
  type: "token" | "done" | "tool_data" | "error";
  content?: string;
  data?: unknown;
}

interface UseWebSocketOptions {
  onToken:    (token: string) => void;   // streaming token received
  onDone:     () => void;                // assistant turn complete
  onToolData: (data: unknown) => void;   // structured quiz / flashcard data
}

interface UseWebSocketReturn {
  sendMessage: (text: string, subjectId?: number) => void;
  isConnected: boolean;
}

// ── Hook ────────────────────────────────────────────────────
export function useWebSocket({
  onToken,
  onDone,
  onToolData,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef          = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callbacks fresh without recreating the socket
  const onTokenRef    = useRef(onToken);
  const onDoneRef     = useRef(onDone);
  const onToolDataRef = useRef(onToolData);
  useEffect(() => { onTokenRef.current    = onToken;    }, [onToken]);
  useEffect(() => { onDoneRef.current     = onDone;     }, [onDone]);
  useEffect(() => { onToolDataRef.current = onToolData; }, [onToolData]);

  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();

    const ws = new WebSocket(WS_URL);
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

      if (reconnectCount.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCount.current += 1;
        const delay = RECONNECT_DELAY_MS * reconnectCount.current;
        reconnectTimer.current = setTimeout(connect, delay);
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

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
