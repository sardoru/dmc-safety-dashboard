import { useRef, useState } from 'react';
import { RadioTower, Play, Pause, Volume2, ExternalLink, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const FEED_ID = (import.meta.env.VITE_BROADCASTIFY_FEED_ID as string) || '215';
// Broadcastify's own web player streams this CORS-open (`access-control-allow-origin: *`)
// Icecast MP3 mount, so we can play it inline in our own <audio> with no popup/iframe.
// An explicit VITE_BROADCASTIFY_STREAM_URL (e.g. a Premium relay) still wins if set.
const STREAM_URL =
  (import.meta.env.VITE_BROADCASTIFY_STREAM_URL as string | undefined) ||
  `https://broadcastify.cdnstream1.com/${FEED_ID}`;
const LISTEN_URL = `https://www.broadcastify.com/listen/feed/${FEED_ID}`;
const PLAYER_URL = `https://www.broadcastify.com/webPlayer/${FEED_ID}`;

/**
 * Live City of Memphis Police Department scanner (Broadcastify feed 215 —
 * "Memphis Police & Shelby County Sheriff").
 *
 * If VITE_BROADCASTIFY_STREAM_URL is set (a Broadcastify Premium / relay direct
 * stream; CORS is open on the stream) we play it inline with custom controls.
 * Otherwise we launch the official Broadcastify player in a compact popup,
 * which keeps us within their terms while still putting the audio one tap away.
 */
export default function PoliceScanner() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [volume, setVolume] = useState(0.85);

  const inlineMode = Boolean(STREAM_URL) && !failed;

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
    const win = window.open(
      PLAYER_URL,
      'mpd-scanner',
      'width=460,height=240,menubar=no,toolbar=no,location=no',
    );
    if (!win) window.open(LISTEN_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={`px-3 py-2.5 border-b ${dark ? 'border-white/5 bg-white/[0.02]' : 'border-neutral-100 bg-neutral-50/60'}`}
    >
      <div className="flex items-center gap-2.5">
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-navy-600 flex items-center justify-center">
            <RadioTower className="w-4.5 h-4.5 text-gold-400" />
          </div>
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white dark:border-neutral-900 animate-pulse" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="fluid-text-sm font-bold truncate">Memphis PD Scanner</p>
            <span className={`fluid-text-xs font-mono flex-shrink-0 ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
              #{FEED_ID}
            </span>
          </div>
          <p className={`fluid-text-xs truncate ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            MPD &amp; Shelby County Sheriff · live
          </p>
        </div>

        {inlineMode ? (
          <button
            onClick={toggle}
            className={`tap-target flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-colors ${
              playing
                ? 'bg-red-600 text-white'
                : dark
                  ? 'bg-gold-500 text-navy-900 hover:bg-gold-400'
                  : 'bg-navy-600 text-white hover:bg-navy-700'
            }`}
            aria-label={playing ? 'Pause scanner' : 'Play scanner'}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : playing ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
        ) : (
          <button
            onClick={openPlayer}
            className={`tap-target flex items-center gap-1.5 px-3 py-2 rounded-xl flex-shrink-0 font-semibold fluid-text-xs transition-colors ${
              dark ? 'bg-gold-500 text-navy-900 hover:bg-gold-400' : 'bg-navy-600 text-white hover:bg-navy-700'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            Listen
          </button>
        )}
      </div>

      {inlineMode && playing && (
        <div className="flex items-center gap-2 mt-2 pl-11">
          <Volume2 className={`w-3.5 h-3.5 flex-shrink-0 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
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
            className="flex-1 accent-gold-500 h-1"
            aria-label="Scanner volume"
          />
        </div>
      )}

      {!inlineMode && (
        <a
          href={LISTEN_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 mt-1.5 pl-11 fluid-text-xs ${dark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600'}`}
        >
          via Broadcastify <ExternalLink className="w-3 h-3" />
        </a>
      )}

      {STREAM_URL && (
        <audio
          ref={audioRef}
          src={STREAM_URL}
          preload="none"
          onError={() => {
            setFailed(true);
            setPlaying(false);
          }}
          onPause={() => setPlaying(false)}
          onPlaying={() => setPlaying(true)}
        />
      )}
    </div>
  );
}
