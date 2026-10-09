import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Keyboard, LogIn, Mic, MicOff, PhoneOff, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { ElevenSession } from '../../lib/elevenSession';
import { LiveSession, type CapturedReport, type LiveCallbacks, type LiveStatus } from '../../lib/live';
import { ApiError, apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { cn } from '../../lib/format';
import BrandImage from '../brand/BrandImage';
import { Button, ButtonLink } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import VoiceOrb, { type OrbMode } from '../voice/VoiceOrb';
import DraftPreview from './DraftPreview';
import type { ReportDraft } from './draft';

interface Line {
  id: number;
  role: 'caller' | 'interviewer';
  text: string;
  live?: boolean;
}

interface VoiceInterviewProps {
  draft: ReportDraft;
  onCapture: (report: CapturedReport) => void;
  onTranscript: (text: string) => void;
  onReview: () => void;
  onUseForm: () => void;
}

interface VoiceConfig {
  configured: boolean;
  /** `elevenlabs`: the Eleven v4 agent. `gpt-live`: the OpenAI fallback. */
  provider?: 'elevenlabs' | 'gpt-live' | null;
  model?: string | null;
}

/** Either voice line — both take the same callbacks. */
interface VoiceLine {
  start(): Promise<void>;
  stop(): Promise<void>;
  setMuted(muted: boolean): void;
}

interface ConfigProblem {
  /** `auth`: the sign-in expired. `unreachable`: the check itself failed. */
  kind: 'auth' | 'unreachable';
  detail: string;
}

function mmss(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Two-way voice reporting: an ElevenLabs agent speaking with Eleven v4 (or the
 * OpenAI GPT-Live line where that agent isn't set up). The interviewer greets
 * first, asks the follow-up questions, and files the structured report —
 * which appears in the draft beside the conversation.
 */
export default function VoiceInterview({ draft, onCapture, onTranscript, onReview, onUseForm }: VoiceInterviewProps) {
  const { isDemo, role } = useAuth();
  const { unlock, prefs, info } = useVoice();
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [problem, setProblem] = useState<ConfigProblem | null>(null);
  const [checkNonce, setCheckNonce] = useState(0);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [filedCount, setFiledCount] = useState(0);

  const session = useRef<VoiceLine | null>(null);
  const levels = useRef({ user: 0, assistant: 0 });
  const seq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const onCaptureRef = useRef(onCapture);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onCaptureRef.current = onCapture;
    onTranscriptRef.current = onTranscript;
  }, [onCapture, onTranscript]);

  // Which voice line does this deployment have? A failed check is reported as
  // what it is (an expired sign-in, an unreachable server) — not as "not set up".
  useEffect(() => {
    if (isDemo) return;
    let cancelled = false;
    apiFetch<VoiceConfig>('/api/voice-session')
      .then((c) => {
        if (cancelled) return;
        setConfig(c && typeof c === 'object' && 'configured' in c ? c : { configured: false });
        setProblem(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : 0;
        setProblem({
          kind: status === 401 ? 'auth' : 'unreachable',
          detail: err instanceof Error ? err.message : 'Request failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isDemo, checkNonce]);

  // End the call if the page unmounts.
  useEffect(
    () => () => {
      void session.current?.stop();
      session.current = null;
    },
    [],
  );

  useEffect(() => {
    if (startedAt === null || status !== 'connected') return;
    const t = window.setInterval(() => setElapsed(Date.now() - startedAt), 500);
    return () => window.clearInterval(t);
  }, [startedAt, status]);

  // Keep the transcript scrolled to the newest line, and share it upward.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
    // A fresh mount (e.g. Back from review) starts empty — that must not wipe
    // the transcript already in the draft.
    if (!lines.length) return;
    const text = lines
      .filter((l) => !l.live)
      .map((l) => `${l.role === 'caller' ? 'Caller' : 'Interviewer'}: ${l.text}`)
      .join('\n');
    onTranscriptRef.current(text);
  }, [lines]);

  const start = async () => {
    if (!config?.configured) return;
    unlock();
    setError('');
    setLines([]);
    setFiledCount(0);
    setMuted(false);
    const callbacks: LiveCallbacks = {
      onStatus: (st) => {
        setStatus(st);
        if (st === 'connected') setStartedAt(Date.now());
      },
      onSpeakingChange: setSpeaking,
      onLevels: (u, a) => {
        levels.current.user = u;
        levels.current.assistant = a;
      },
      onUserTranscript: (text) => setLines((prev) => [...prev, { id: ++seq.current, role: 'caller', text }]),
      onAssistantTranscript: (text, done) =>
        setLines((prev) => {
          const rest = prev.filter((l) => !(l.role === 'interviewer' && l.live));
          return [...rest, { id: ++seq.current, role: 'interviewer', text, live: !done }];
        }),
      onReport: (r) => {
        setFiledCount((n) => n + 1);
        onCaptureRef.current(r);
      },
      onError: (m) => setError(m),
    };
    const s: VoiceLine =
      config.provider === 'elevenlabs'
        ? new ElevenSession(callbacks, { voiceId: prefs.voiceId ?? undefined })
        : new LiveSession(callbacks);
    session.current = s;
    await s.start();
  };

  const end = async () => {
    const s = session.current;
    session.current = null;
    await s?.stop();
    setSpeaking(false);
  };

  const toggleMute = () => {
    const next = !muted;
    session.current?.setMuted(next);
    setMuted(next);
  };

  // The interviewer speaks in the member's chosen dashboard voice, else the default one.
  const elevenVoiceId = prefs.voiceId ?? info.defaultVoiceId;
  const elevenVoice = elevenVoiceId ? info.voices.find((v) => v.id === elevenVoiceId)?.name : undefined;
  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const ended = status === 'closed' || status === 'error';
  const orbMode: OrbMode = connecting ? 'connecting' : connected ? (muted ? 'muted' : speaking ? 'speaking' : 'listening') : ended ? 'ended' : 'idle';
  const hasDraft = Boolean(draft.category || draft.description);

  const retryCheck = () => {
    setProblem(null);
    setCheckNonce((n) => n + 1);
  };

  if (!isDemo && problem) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card flex flex-col items-center p-8 text-center">
          <BrandImage name="illoVoice" width={320} alt="" className="mb-2 h-44 w-44 object-contain" fallback={<VoiceOrb mode="idle" levels={levels} size={170} className="mb-4" />} />
          <h2 className="text-lg font-bold text-ink">Report by voice</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            {problem.kind === 'auth'
              ? 'Your sign-in has expired, so the voice line can’t start. Sign in again, then come back to this report.'
              : `Couldn’t reach the voice line (${problem.detail}). Check your connection and try again, or use the guided form.`}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {problem.kind === 'auth' ? (
              <ButtonLink to="/login" state={{ from: '/report' }} icon={<LogIn className="h-4 w-4" />}>
                Sign in again
              </ButtonLink>
            ) : (
              <Button icon={<RefreshCw className="h-4 w-4" />} onClick={retryCheck}>
                Try again
              </Button>
            )}
            <Button variant="secondary" icon={<Keyboard className="h-4 w-4" />} onClick={onUseForm}>
              Use the guided form
            </Button>
          </div>
        </div>
        <HowItWorks />
      </div>
    );
  }

  if (isDemo || (config && !config.configured)) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="card flex flex-col items-center p-8 text-center">
          <BrandImage name="illoVoice" width={320} alt="" className="mb-2 h-44 w-44 object-contain" fallback={<VoiceOrb mode="idle" levels={levels} size={170} className="mb-4" />} />
          <h2 className="text-lg font-bold text-ink">Report by voice</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            {isDemo
              ? 'The two-way voice interview runs on the connected deployment: an automated interviewer greets you, asks the right follow-up questions, and fills in the report while you talk.'
              : 'Voice reporting isn’t set up on this deployment yet. Use the guided form instead — it works the same way.'}
          </p>
          <Button className="mt-6" icon={<Keyboard className="h-4 w-4" />} onClick={onUseForm}>
            Use the guided form
          </Button>
        </div>
        <HowItWorks />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      {/* Conversation */}
      <div className="card flex min-h-[560px] flex-col overflow-hidden">
        <div className="relative flex flex-col items-center border-b border-line bg-brand-night px-6 pb-6 pt-8 text-center">
          <VoiceOrb mode={orbMode} levels={levels} size={200} />
          <p className="mt-4 text-[15px] font-semibold text-white">
            {connecting
              ? 'Connecting to the interviewer…'
              : connected
                ? muted
                  ? 'You’re muted'
                  : speaking
                    ? 'Interviewer speaking — interrupt anytime'
                    : 'Listening — describe what you saw'
                : ended
                  ? 'Call ended'
                  : 'Ready when you are'}
          </p>
          <p className="mt-1 text-[12px] text-navy-200">
            {connected
              ? `${mmss(elapsed)}${config?.provider === 'elevenlabs' ? ` · ${elevenVoice ? `Eleven v4 · ${elevenVoice}` : 'Eleven v4'}` : ''}`
              : config
                ? 'Speak naturally — like calling a dispatcher'
                : 'Checking the voice line…'}
          </p>

          <div className="mt-5 flex items-center gap-3">
            {connected || connecting ? (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  disabled={!connected}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full border transition-colors',
                    muted ? 'border-amber-300 bg-amber-400 text-navy-900' : 'border-white/20 bg-white/10 text-white hover:bg-white/15',
                  )}
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void end()}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-red-600 px-6 text-sm font-bold text-white shadow-lg shadow-red-900/30 hover:bg-red-700"
                >
                  <PhoneOff className="h-5 w-5" /> End call
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void start()}
                disabled={!config?.configured}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-gold-400 px-7 text-[15px] font-bold text-navy-900 shadow-lg shadow-black/20 transition-transform hover:bg-gold-300 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
              >
                <Mic className="h-5 w-5" /> {ended ? 'Start a new call' : 'Start voice interview'}
              </button>
            )}
          </div>
        </div>

        <div ref={scroller} className="scrollbar-thin min-h-[180px] flex-1 space-y-3 overflow-y-auto px-5 py-4" aria-live="polite">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-6 text-center">
              <ShieldCheck className="mb-2 h-6 w-6 text-accent" />
              <p className="text-[13px] font-semibold text-ink">A two-way conversation, not a form</p>
              <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted">
                The interviewer asks what happened, where, and who was involved, then files the report. Your words are transcribed and attached to it.
              </p>
            </div>
          ) : (
            lines.map((l) => (
              <div key={l.id} className={cn('flex', l.role === 'caller' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed',
                    l.role === 'caller' ? 'rounded-br-md bg-primary text-primary-ink' : 'rounded-bl-md border border-line bg-surface-2 text-ink',
                    l.live && 'opacity-80',
                  )}
                >
                  {l.role === 'interviewer' && <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-accent-strong">Interviewer</span>}
                  {l.text}
                  {l.live && <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-current align-middle" />}
                </div>
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="border-t border-line p-3">
            <Banner tone="danger">{error}</Banner>
          </div>
        )}
      </div>

      {/* Draft */}
      <div className="space-y-4">
        <DraftPreview draft={draft} live={connected} />
        {filedCount > 0 && (
          <p className="flex items-center gap-1.5 text-[13px] text-accent-strong">
            <Sparkles className="h-4 w-4" /> The interviewer filed your report{filedCount > 1 ? ` (${filedCount} updates)` : ''} — review it, add photos and send.
          </p>
        )}
        <Button block size="lg" iconRight={<ArrowRight className="h-4 w-4" />} disabled={!hasDraft} onClick={() => void end().then(onReview)}>
          Review &amp; submit
        </Button>
        <button type="button" onClick={onUseForm} className="w-full text-center text-[13px] font-medium text-muted hover:text-ink">
          Prefer typing? Switch to the guided form
        </button>
        {role === 'business' && !connected && <HowItWorks compact />}
      </div>
    </div>
  );
}

function HowItWorks({ compact }: { compact?: boolean }) {
  const steps = [
    ['Tap start and allow the microphone', 'The interviewer greets you first.'],
    ['Tell it what you saw', 'It asks short follow-up questions — interrupt any time.'],
    ['Review, add photos, send', 'The report goes straight to downtown officers.'],
  ];
  return (
    <div className={cn('card', compact ? 'p-4' : 'p-6')}>
      <p className="eyebrow mb-3">How it works</p>
      <ol className="space-y-3">
        {steps.map(([title, body], idx) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-strong">{idx + 1}</span>
            <span>
              <span className="block text-[14px] font-semibold text-ink">{title}</span>
              <span className="block text-[13px] text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
