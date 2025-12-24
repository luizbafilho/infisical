import { useCallback, useEffect, useRef, useState } from "react";

import { useUser } from "@app/context";
import { getAuthToken } from "@app/hooks/api/reactQuery";

// WebSocket message types
type WSMessageType =
  | "connected"
  | "execute_query"
  | "query_result"
  | "query_error"
  | "session_expired";

interface WSMessage {
  type: WSMessageType;
  message?: string;
  query?: string;
  options?: {
    maxRows?: number;
  };
  data?: {
    rows: any[];
    rowCount: number;
    fields: Array<{ name: string; dataTypeID: number }>;
    executionTime: number;
  };
  error?: {
    message: string;
    code?: string;
  };
}

interface ExecuteQueryOptions {
  maxRows?: number;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface UsePamWebSocketReturn {
  connectionStatus: ConnectionStatus;
  executeQuery: (query: string, options?: ExecuteQueryOptions) => void;
  lastResult: WSMessage["data"] | null;
  lastError: WSMessage["error"] | null;
  isExecuting: boolean;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

export const usePamWebSocket = (sessionId: string): UsePamWebSocketReturn => {
  const { user } = useUser();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [lastResult, setLastResult] = useState<WSMessage["data"] | null>(null);
  const [lastError, setLastError] = useState<WSMessage["error"] | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus("connecting");

    // Get WebSocket protocol based on current protocol
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const token = getAuthToken();

    if (!token) {
      console.error("No authentication token found");
      setConnectionStatus("disconnected");
      return;
    }

    const wsUrl = `${protocol}//${window.location.host}/api/v1/pam/sessions/${sessionId}/ws`;

    try {
      // Use Sec-WebSocket-Protocol to pass the token
      // The protocol parameter becomes the Sec-WebSocket-Protocol header
      const ws = new WebSocket(wsUrl, [`bearer.${token}`]);

      ws.onopen = () => {
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);

          switch (message.type) {
            case "connected":
              setConnectionStatus("connected");
              break;
            case "query_result":
              setLastResult(message.data || null);
              setLastError(null);
              setIsExecuting(false);
              break;
            case "query_error":
              setLastError(message.error || { message: "Unknown error" });
              setLastResult(null);
              setIsExecuting(false);
              break;
            case "session_expired":
              setLastError({ message: message.message || "Session expired" });
              setIsExecuting(false);
              shouldReconnectRef.current = false;
              ws.close();
              break;
            default:
              console.warn("Unknown message type:", message.type);
          }
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        setConnectionStatus("disconnected");
      };

      ws.onclose = () => {
        setConnectionStatus("disconnected");
        wsRef.current = null;

        // Attempt to reconnect with exponential backoff
        if (shouldReconnectRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(
            INITIAL_RECONNECT_DELAY * 2 ** reconnectAttemptsRef.current,
            MAX_RECONNECT_DELAY
          );
          setConnectionStatus("reconnecting");

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
      setConnectionStatus("disconnected");
    }
  }, [sessionId]);

  const executeQuery = useCallback((query: string, options?: ExecuteQueryOptions) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setLastError({ message: "WebSocket not connected" });
      return;
    }

    setIsExecuting(true);
    setLastError(null);
    setLastResult(null);

    const message: WSMessage = {
      type: "execute_query",
      query,
      options: {
        maxRows: options?.maxRows || 1000
      }
    };

    wsRef.current.send(JSON.stringify(message));
  }, []);

  // Connect on mount
  useEffect(() => {
    if (!user) {
      return undefined;
    }

    shouldReconnectRef.current = true;
    connect();

    // Cleanup on unmount
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect, user]);

  return {
    connectionStatus,
    executeQuery,
    lastResult,
    lastError,
    isExecuting
  };
};
