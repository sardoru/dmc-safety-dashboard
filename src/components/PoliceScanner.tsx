import { useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Pause, Play, RadioTower, Volume2 } from 'lucide-react';
import { cn } from '../lib/format';

const FEED_ID = (import.meta.env.VITE_BROADCASTIFY_FEED_ID as string) || '215';
// Broadcastify's own web player streams this CORS-open (`access-control-allow-origin: *`)
// Icecast MP3 mount, so it plays inline in our own <audio>. An explicit
// VITE_BROADCASTIFY_STREAM_URL (e.g. a Premium relay) wins if set.
const STREAM_URL =
  (import.meta.env.VITE_BROADCASTIFY_STREAM_URL as string | undefined) || `https://broadcastify.cdnstream1.com/${FEED_ID}`;
const LISTEN_URL = `https://www.broadcastify.com/listen/feed/${FEED_ID}`;
const PLAYER_URL = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;

/**
 * Live Memphis PD / Shelby County Sheriff scanner (Broadcastify feed 215),
 * played inline; falls back to the official popup player if the stream fails.
 */
export default function PoliceScanner({ variant = 'card', className }: { variant?: 'card' | 'bar'; className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [volume, setVolume] = useState(0.8);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      el.volume = volume;
      await el.play();
      setPlaying(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const openPlayer = () => {
    const win = window.open(PLAYER_URL, 'mpd-scanner', 'width=460,height=240,menubar=no,toolbar=no,location=no');
    if (!win) window.open(LISTEN_URL, '_blank', 'noopener,noreferrer');
  };

  const button = failed ? (
    <button
      onClick={openPlayer}
      className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-[13px] font-semibold text-primary-ink hover:bg-primary-hover"
    >
      <ExternalLink className="h-3.5 w-3.5" /> Open player
    </button>
  ) : (
    <button
      onClick={() => void toggle()}
      className={cn(
        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
        playing ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-primary text-primary-ink hover:bg-primary-hover',
      )}
      aria-label={playing ? 'Pause scanner' : 'Play scanner'}
    >
      {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
    </button>
  );

  return (
    <div className={cn(variant === 'card' ? 'card p-3.5' : '', className)}>
      <div className="flex items-center gap-3">
        <span className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-600 text-gold-300">
          <RadioTower className="h-5 w-5" />
          {playing && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-surface bg-red-500" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
            Memphis PD scanner
            <span className="font-mono text-[11px] font-normal text-subtle">#{FEED_ID}</span>
          </p>
          <p className="truncate text-[12px] text-muted">
            {playing ? 'Live · MPD & Shelby County Sheriff' : 'MPD & Shelby County Sheriff · via Broadcastify'}
          </p>
        </div>
        {button}
      </div>
      {playing && (
        <div className="mt-2.5 flex items-center gap-2 pl-[52px]">
          <Volume2 className="h-3.5 w-3.5 flex-shrink-0 text-subtle" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              if (audioRef.current) audioRef.current.volume = v;
            }}
            className="h-1 flex-1 accent-[var(--accent)]"
            aria-label="Scanner volume"
          />
        </div>
      )}
      <audio
        ref={audioRef}
        src={STREAM_URL}
        preload="none"
        onError={() => {
          if (audioRef.current?.src) {
            setFailed(true);
            setPlaying(false);
          }
        }}
        onPause={() => setPlaying(false)}
        onPlaying={() => setPlaying(true)}
      />
    </div>
  );
}
