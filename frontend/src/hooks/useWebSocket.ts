import { useEffect, useRef, useState, useCallback } from "react";

// ── Config ──────────────────────────────────────────────────
const WS_URL = "ws://localhost:8000/ws/chat";
const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

// ── Types ───────────────────────────────────────────────────
interface UseWebSocketOptions {
  onMessage: (content: string) => void;
}

interface UseWebSocketReturn {
  sendMessage: (text: string) => void;
  isConnected: boolean;
}

// ── Hook ────────────────────────────────────────────────────
export function useWebSocket({ onMessage }: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectCount   = useRef(0);
  const reconnectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef     = useRef(onMessage);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the callback ref fresh without recreating the socket
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    // Clean up any existing socket
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectCount.current = 0;
      console.log("[Mimir WS] Connected to backend");
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as { content?: string; type?: string };
        if (data.content) {
          onMessageRef.current(data.content);
        }
      } catch {
        // Raw text fallback
        onMessageRef.current(event.data as string);
      }
    };

    ws.onerror = (err) => {
      console.warn("[Mimir WS] Error:", err);
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log("[Mimir WS] Disconnected");

      // Auto-reconnect with back-off
      if (reconnectCount.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCount.current += 1;
        const delay = RECONNECT_DELAY_MS * reconnectCount.current;
        console.log(`[Mimir WS] Reconnecting in ${delay}ms (attempt ${reconnectCount.current})`);
        reconnectTimer.current = setTimeout(connect, delay);
      } else {
        console.warn("[Mimir WS] Max reconnect attempts reached");
      }
    };
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ message: text }));
    } else {
      console.warn("[Mimir WS] Cannot send — socket not open");
    }
  }, []);

  return { sendMessage, isConnected };
}
