import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { RadioEntry, WsStatus, ConnectionMode } from '../types';
import { generateRadioEntry, generateInitialRadioEntries } from '../data/mockRadio';
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

function classifyUrgency(text: string): RadioEntry['urgency'] {
  const lower = text.toLowerCase();
  if (/10-52|code red|emergency|robbery|armed|fire alarm|10-70|backup requested|medical emergency/i.test(lower)) {
    return 'emergency';
  }
  if (/be advised|suspicious|complaint|heads up|erratic|noise|unverified|fender bender/i.test(lower)) {
    return 'caution';
  }
  return 'routine';
}

export function RadioProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<RadioEntry[]>(() => generateInitialRadioEntries(10));
  const [isLive, setIsLive] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('mock');
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const mockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLiveRef = useRef(isLive);
  const mountedRef = useRef(true);

  // Keep ref in sync so callbacks always see latest
  useEffect(() => {
    isLiveRef.current = isLive;
  }, [isLive]);

  const addEntry = useCallback((entry: RadioEntry) => {
    setEntries(prev => {
      const next = [...prev, entry];
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
    });
  }, []);

  // ---------- Mock mode ----------
  const startMock = useCallback(() => {
    if (mockIntervalRef.current) return;
    setConnectionMode('mock');
    setWsStatus('mock');
    const tick = () => {
      if (isLiveRef.current) {
        addEntry(generateRadioEntry());
      }
    };
    mockIntervalRef.current = setInterval(tick, 5000 + Math.random() * 5000);
  }, [addEntry]);

  const stopMock = useCallback(() => {
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current);
      mockIntervalRef.current = null;
    }
  }, []);

  // ---------- WebSocket ----------
  const connect = useCallback(() => {
    if (!isLiveRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;

    setWsStatus('connecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      // Invalid URL or blocked — go straight to mock
      startMock();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) { ws.close(); return; }
      backoffRef.current = 1000;
      stopMock();
      setConnectionMode('live');
      setWsStatus('connected');
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'transcription') {
          const entry: RadioEntry = {
            id: generateId(),
            timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
            speaker: data.channel || 'Unknown',
            channel: data.channel || 'Unknown',
            text: data.text || '',
            urgency: classifyUrgency(data.text || ''),
            energy: data.energy,
            duration_seconds: data.duration_seconds,
          };
          addEntry(entry);
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
      startMock();
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror — handled there
      ws.close();
    };
  }, [addEntry, startMock, stopMock]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimer.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    reconnectTimer.current = setTimeout(() => {
      reconnectTimer.current = null;
      if (isLiveRef.current && mountedRef.current) {
        connect();
      }
    }, delay);
  }, [connect]);

  // ---------- Lifecycle ----------
  useEffect(() => {
    mountedRef.current = true;
    if (isLive) {
      connect();
      // Start mock immediately as optimistic fallback — will be stopped if WS connects
      const fallbackTimer = setTimeout(() => {
        if (wsStatus !== 'connected' && mountedRef.current) {
          startMock();
        }
      }, 2000);
      return () => {
        clearTimeout(fallbackTimer);
      };
    } else {
      // Paused
      if (wsRef.current) wsRef.current.close();
      stopMock();
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (wsRef.current) wsRef.current.close();
      stopMock();
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    };
  }, [stopMock]);

  const toggleLive = () => setIsLive(l => !l);

  return (
    <RadioContext.Provider value={{ entries, isLive, toggleLive, isSpeaking, connectionMode, wsStatus }}>
      {children}
    </RadioContext.Provider>
  );
}

export function useRadio(): RadioContextType {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used within RadioProvider');
  return ctx;
}
