import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, Volume2, AudioLines } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { RealtimeSession, type RealtimeStatus, type CapturedReport } from '../../lib/realtime';

interface Props {
  onUserTranscript: (text: string) => void;
  onReport: (report: CapturedReport) => void;
}

export default function VoiceReportRealtime({ onUserTranscript, onReport }: Props) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const [speaking, setSpeaking] = useState(false);
  const [assistantLine, setAssistantLine] = useState('');
  const [error, setError] = useState('');
  const sessionRef = useRef<RealtimeSession | null>(null);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  const connect = async () => {
    setError('');
    setAssistantLine('');
    const session = new RealtimeSession({
      onStatus: setStatus,
      onSpeakingChange: setSpeaking,
      onUserTranscript,
      onAssistantTranscript: (text, done) => setAssistantLine(done ? '' : text),
      onReport,
      onError: (m) => setError(m),
    });
    sessionRef.current = session;
    await session.start();
  };

  const disconnect = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setSpeaking(false);
    setAssistantLine('');
  };

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  return (
    <div className="flex flex-col items-center text-center">
      <button
        onClick={connected || connecting ? disconnect : connect}
        disabled={connecting}
        className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all ${
          connected
            ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
            : dark
              ? 'bg-gold-500 text-navy-900 hover:bg-gold-400'
              : 'bg-navy-600 text-white hover:bg-navy-700'
        } ${connecting ? 'opacity-80 cursor-wait' : 'active:scale-95'}`}
        aria-label={connected ? 'End voice report' : 'Start voice report'}
      >
        {connected && (
          <span className="absolute inset-0 rounded-full bg-red-500/40 animate-pulse-ring" />
        )}
        {connecting ? (
          <Loader2 className="w-10 h-10 animate-spin" />
        ) : connected ? (
          <Square className="w-9 h-9" />
        ) : (
          <Mic className="w-10 h-10" />
        )}
      </button>

      <div className="mt-4 h-6 flex items-center justify-center">
        {connected ? (
          speaking ? (
            <span className="inline-flex items-center gap-1.5 fluid-text-sm font-medium text-gold-500">
              <Volume2 className="w-4 h-4" /> Assistant speaking…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 fluid-text-sm font-medium text-green-500">
              <AudioLines className="w-4 h-4" /> Listening — describe what you saw
            </span>
          )
        ) : connecting ? (
          <span className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Connecting…
          </span>
        ) : (
          <span className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Tap to start a hands-free voice report
          </span>
        )}
      </div>

      {assistantLine && (
        <p
          className={`mt-1 fluid-text-sm italic max-w-md ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}
        >
          “{assistantLine}”
        </p>
      )}

      {sessionRef.current?.isMobile && connected && (
        <p className={`mt-2 fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
          Tip: use earbuds for the smoothest back-and-forth.
        </p>
      )}

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm max-w-md">
          {error}
        </div>
      )}
    </div>
  );
}
