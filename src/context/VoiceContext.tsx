import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { speech, type SpeakOptions, type SpeechEngineKind, type SpeechState } from '../lib/speech';
import { apiFetch } from '../lib/api';
import { nearbyAnnouncement, officerAnnouncement, statusAnnouncement } from '../lib/announce';
import { distanceMiles } from '../lib/geo';
import { categoryMeta, STATUSES } from '../lib/taxonomy';
import type { Priority } from '../types';
import { useAuth } from './AuthContext';
import { useIncidents } from './IncidentContext';
import { useProfile } from './ProfileContext';
import { useToast } from './ToastContext';

export interface VoiceInfo {
  id: string;
  name: string;
  category?: string;
  description?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  previewUrl?: string;
}

export interface VoicePrefs {
  /** ElevenLabs voice id (null = deployment default). */
  voiceId: string | null;
  /** Speak new reports aloud. */
  alerts: boolean;
  /** Announce reports at this priority or more urgent. */
  minPriority: Priority;
  /** Read the confirmation back after filing a report. */
  readBack: boolean;
  /** Read the guided form's questions aloud. */
  guide: boolean;
}

interface TtsInfo {
  loading: boolean;
  configured: boolean | null;
  model?: string;
  fallbackModel?: string;
  defaultVoiceId?: string;
  voices: VoiceInfo[];
  voiceSource?: 'account' | 'curated';
  error?: string;
}

interface VoiceContextType {
  state: SpeechState;
  prefs: VoicePrefs;
  setPrefs: (patch: Partial<VoicePrefs>) => void;
  info: TtsInfo;
  refreshInfo: () => Promise<void>;
  speak: (text: string, opts?: SpeakOptions) => Promise<SpeechEngineKind | null>;
  stop: () => void;
  /** Call from a click: allows alert audio later without a gesture. */
  unlock: () => void;
  audioReady: boolean;
  /** Human label for the active voice. */
  voiceLabel: string;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

const NEARBY_MILES = 0.5;

function defaultPrefs(role: string | null): VoicePrefs {
  const staff = role === 'officer' || role === 'admin';
  return { voiceId: null, alerts: staff, minPriority: staff ? 3 : 2, readBack: true, guide: false };
}

function loadPrefs(role: string | null): VoicePrefs {
  try {
    const raw = localStorage.getItem(`dt-voice-prefs-${role ?? 'guest'}`);
    if (raw) return { ...defaultPrefs(role), ...(JSON.parse(raw) as Partial<VoicePrefs>) };
  } catch {
    /* ignore */
  }
  return defaultPrefs(role);
}

function notify(title: string, body: string, tag: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification(title, { body, tag, icon: '/favicon-32.png' });
    }
  } catch {
    /* some mobile browsers throw on new Notification() */
  }
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { role, signedIn, isDemo, userId } = useAuth();
  const { subscribe } = useIncidents();
  const { profile } = useProfile();
  const { push } = useToast();

  const state = useSyncExternalStore(
    (fn) => speech.subscribe(fn),
    () => speech.getState(),
    () => speech.getState(),
  );

  const [prefsByRole, setPrefsByRole] = useState<Record<string, VoicePrefs>>({});
  const prefs = useMemo(() => prefsByRole[role ?? 'guest'] ?? loadPrefs(role), [prefsByRole, role]);
  const [audioReady, setAudioReady] = useState(false);

  const setPrefs = useCallback(
    (patch: Partial<VoicePrefs>) => {
      const key = role ?? 'guest';
      setPrefsByRole((prev) => {
        const next = { ...(prev[key] ?? loadPrefs(role)), ...patch };
        try {
          localStorage.setItem(`dt-voice-prefs-${key}`, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return { ...prev, [key]: next };
      });
    },
    [role],
  );

  // ElevenLabs status + voice list, fetched once per signed-in user.
  const fetchKey = signedIn && !isDemo ? (userId ?? 'me') : null;
  const [fetched, setFetched] = useState<{ key: string; nonce: number; info: TtsInfo } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!fetchKey) {
      speech.setElevenAvailable(false);
      return;
    }
    let cancelled = false;
    apiFetch<Omit<TtsInfo, 'loading'>>('/api/tts')
      .then((data) => {
        if (cancelled) return;
        setFetched({ key: fetchKey, nonce, info: { ...data, loading: false } });
        speech.setElevenAvailable(Boolean(data.configured));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetched({
          key: fetchKey,
          nonce,
          info: { loading: false, configured: false, voices: [], error: err instanceof Error ? err.message : 'unavailable' },
        });
        speech.setElevenAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchKey, nonce]);

  const info: TtsInfo = !fetchKey
    ? { loading: false, configured: false, voices: [], error: isDemo ? 'demo' : 'signed-out' }
    : fetched && fetched.key === fetchKey && fetched.nonce === nonce
      ? fetched.info
      : { loading: true, configured: fetched?.info.configured ?? null, voices: fetched?.info.voices ?? [] };

  const refreshInfo = useCallback(async () => {
    setNonce((n) => n + 1);
  }, []);

  const voiceId = prefs.voiceId ?? info.defaultVoiceId ?? undefined;

  const speak = useCallback(
    (text: string, opts: SpeakOptions = {}) => speech.speak(text, { voiceId, ...opts }),
    [voiceId],
  );
  const stop = useCallback(() => speech.stop(), []);
  const unlock = useCallback(() => {
    speech.unlock();
    setAudioReady(true);
  }, []);

  // ── Announcer ───────────────────────────────────────────────────────────
  const live = useRef({ role, prefs, profile, userId, audioReady, speak });
  useEffect(() => {
    live.current = { role, prefs, profile, userId, audioReady, speak };
  }, [role, prefs, profile, userId, audioReady, speak]);

  useEffect(() => {
    return subscribe((ev) => {
      const { role: r, prefs: p, profile: biz, userId: me, audioReady: ready, speak: say } = live.current;
      const staff = r === 'officer' || r === 'admin';
      const inc = ev.incident;

      if (ev.type === 'created') {
        if (ev.own) return;
        const label = `${categoryMeta(inc.category).short} · P${inc.priority}`;
        if (staff) {
          speech.chime(inc.priority === 1 ? 'critical' : inc.priority === 2 ? 'high' : 'normal');
          push({
            title: `New report — ${label}`,
            body: `${inc.title} · ${inc.reporterName}`,
            tone: inc.priority <= 2 ? 'danger' : 'warning',
          });
          notify(`New report — ${label}`, inc.title, inc.id);
          if (p.alerts && ready && inc.priority <= p.minPriority) void say(officerAnnouncement(inc), { key: `alert-${inc.id}` });
          return;
        }
        if (r === 'business' && biz && inc.visibility === 'community') {
          const miles = distanceMiles(biz.lat, biz.lng, inc.lat, inc.lng);
          if (miles > NEARBY_MILES) return;
          speech.chime(inc.priority <= 2 ? 'high' : 'normal');
          push({ title: `Nearby: ${categoryMeta(inc.category).short}`, body: inc.title, tone: inc.priority <= 2 ? 'danger' : 'warning' });
          notify(`Safety alert nearby`, inc.title, inc.id);
          if (p.alerts && ready && inc.priority <= p.minPriority) {
            void say(nearbyAnnouncement(inc, biz), { key: `alert-${inc.id}` });
          }
        }
        return;
      }

      // Updates on the reporter's own report.
      const prev = ev.previous;
      if (!prev || prev.status === inc.status || !me || inc.reporterId !== me || staff) return;
      push({
        title: `Update on ${inc.ref}`,
        body: `${STATUSES[inc.status].reporterLabel} — ${inc.title}`,
        tone: inc.status === 'resolved' ? 'success' : 'info',
      });
      notify('Update on your report', `${STATUSES[inc.status].reporterLabel}: ${inc.title}`, `${inc.id}-status`);
      if (p.alerts && ready) void say(statusAnnouncement(inc), { key: `status-${inc.id}` });
    });
  }, [subscribe, push]);

  const voiceLabel =
    info.configured && voiceId
      ? (info.voices.find((v) => v.id === voiceId)?.name ?? 'Natural voice')
      : 'Browser voice';

  return (
    <VoiceContext.Provider
      value={{ state, prefs, setPrefs, info, refreshInfo, speak, stop, unlock, audioReady, voiceLabel }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextType {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}
