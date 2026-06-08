import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RadioEntry, WsStatus, ConnectionMode } from '../types';
import { generateId } from '../utils/helpers';

const WS_URL = import.meta.env.VITE_RADIO_WS_URL || 'ws://localhost:8765';
const MAX_ENTRIES = 200;
const MAX_BACKOFF = 30_000;

interface RadioContextType {
  entries: RadioEntry[];
  isLive: boolean;
  toggleLive: () => void;
  isSpeaking: boolean;
  connectionMode: ConnectionMode;
  wsStatus: WsStatus;
}

const RadioContext = createContext<RadioContextType | null>(null);

/** Heuristic urgency from a transcription or report's text. */
export function classifyUrgency(text: string): RadioEntry['urgency'] {
  const lower = text.toLowerCase();
  if (
    /10-52|code red|emergency|robbery|armed|fire alarm|10-70|backup requested|medical emergency|weapon|assault|shooting/i.test(
      lower,
    )
  ) {
    return 'emergency';
  }
  if (
    /be advised|suspicious|complaint|heads up|erratic|noise|unverified|fender bender|theft|trespass|disturbance|vandalism/i.test(
      lower,
    )
  ) {
    return 'caution';
  }
  return 'routine';
}

/**
 * Live police-scanner transcription feed from the self-hosted radio-transcriptor
 * bridge (WebSocket). There is intentionally **no simulated fallback** — when the
 * bridge is offline the feed simply has no transcriptions, and the dashboard's
 * activity feed shows real platform reports instead.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RadioEntry[]>(() => []);
  const [isLive, setIsLive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const isLiveRef = useRef(isLive);
  const mountedRef = useRef(true);

  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  const addEntry = useCallback((entry: RadioEntry) => {
    setEntries((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  // ---------- WebSocket (real transcription bridge only) ----------
  const connect = useCallback(() => {
    if (!isLiveRef.current) return;
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
    )
      return;

    setWsStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setWsStatus('disconnected');
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      backoffRef.current = 1000;
      setWsStatus('connected');
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcription') {
          addEntry({
            id: generateId(),
            timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
            speaker: data.channel || 'Scanner',
            channel: data.channel || 'Scanner',
            text: data.text || '',
            urgency: classifyUrgency(data.text || ''),
            energy: data.energy,
            duration_seconds: data.duration_seconds,
          });
        } else if (data.type === 'vad') {
          setIsSpeaking(data.event === 'speech_start');
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      wsRef.current = null;
      setWsStatus('disconnected');
      setIsSpeaking(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror — reconnect is handled there.
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addEntry]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (isLiveRef.current && mountedRef.current) connect();
    }, delay);
  }, [connect]);

  // ---------- Lifecycle ----------
  useEffect(() => {
    mountedRef.current = true;
    if (isLive) {
      connect();
    } else {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
  }, []);

  const toggleLive = () => setIsLive((l) => !l);

  return (
    <RadioContext.Provider
      value={{ entries, isLive, toggleLive, isSpeaking, connectionMode: 'live', wsStatus }}
    >
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio(): RadioContextType {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used within RadioProvider');
  return ctx;
}
