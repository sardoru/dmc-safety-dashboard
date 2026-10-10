import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, Volume2 } from 'lucide-react';
import { optimizedUrl, srcSet } from '../lib/brand';
import { cn } from '../lib/format';
import { SHORT_FILM_DURATION } from './filmMeta';
import { formatTime } from './time';

// The 30-second film's files (scripts/film-data.mjs --film in-30-seconds). Only the video, its poster and its
// captions: the landing page doesn't bundle the film's transcript.
const DIR = '/video/in-30-seconds';
const VIDEO = `${DIR}/dmc-safety-in-30-seconds.mp4`;
const POSTER = `${DIR}/poster.jpg`;
const CAPTIONS = `${DIR}/captions.vtt`;
const TITLE = 'The Safety Dashboard in 30 seconds';

/** idle: the poster and a play button · muted: playing on a loop without sound · sound: playing with sound, native controls */
type Mode = 'idle' | 'muted' | 'sound';

/** It plays by itself only where that costs the visitor nothing: a wide screen, no reduced-motion setting, no data saver. */
function canAutoplay(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  return (
    window.matchMedia('(min-width: 1024px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !saveData
  );
}

/**
 * The 30-second film in the landing page hero. On a wide screen it starts at once, muted and on a loop, with the
 * captions on, so the film tells its story without sound; "Watch with sound" plays it from the start with sound and
 * the browser's controls. Elsewhere it waits behind its poster with a play button. The loop pauses while the hero
 * is off screen, and the visitor can pause it at any time.
 */
export default function HeroFilm({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<Mode>('idle');
  // The visitor paused the muted loop (the off-screen pause doesn't count).
  const [held, setHeld] = useState(false);
  // A frame of the video is on screen, so the poster image can go.
  const [shown, setShown] = useState(false);
  // The image service couldn't size the poster: use the poster file itself.
  const [rawPoster, setRawPoster] = useState(false);

  // Muted autoplay on arrival, where it's allowed.
  useEffect(() => {
    const v = ref.current;
    if (!v || !canAutoplay()) return;
    v.muted = true;
    v.play()
      .then(() => setMode('muted'))
      .catch(() => setMode('idle'));
  }, []);

  // The muted loop pauses while the hero is off screen and picks up again when it's back.
  useEffect(() => {
    const v = ref.current;
    if (!v || mode !== 'muted' || held || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [mode, held]);

  const watchWithSound = () => {
    const v = ref.current;
    if (!v) return;
    v.currentTime = 0;
    v.muted = false;
    setHeld(false);
    setMode('sound');
    v.play().catch(() => setMode('idle'));
  };

  const toggleHold = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      setHeld(false);
      v.play().catch(() => {});
    } else {
      setHeld(true);
      v.pause();
    }
  };

  return (
    <figure className={cn('hero-film w-full', className)}>
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-navy-950 shadow-2xl shadow-black/60 ring-1 ring-white/15">
        <video
          ref={ref}
          src={VIDEO}
          playsInline
          preload="none"
          loop={mode !== 'sound'}
          controls={mode === 'sound'}
          onPlaying={() => setShown(true)}
          aria-label={TITLE}
          className="absolute inset-0 h-full w-full object-cover"
        >
          <track kind="captions" src={CAPTIONS} srcLang="en" label="English" default />
        </video>

        {/* The poster (the film's cover frame), resized by the image service, until the video has a frame. */}
        <img
          src={rawPoster ? POSTER : optimizedUrl(POSTER, 1080)}
          srcSet={rawPoster ? undefined : srcSet(POSTER, [640, 1080, 1280])}
          sizes="(min-width: 1280px) 528px, (min-width: 1024px) 46vw, 100vw"
          alt=""
          width={1920}
          height={1080}
          decoding="async"
          onError={() => setRawPoster(true)}
          className={cn(
            'pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            shown ? 'opacity-0' : 'opacity-100',
          )}
        />

        {mode === 'idle' && (
          <button
            type="button"
            onClick={watchWithSound}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none"
            aria-label={`Play “${TITLE}” with sound`}
          >
            <span className="inline-flex items-center gap-2.5 rounded-full bg-gold-400 py-3 pl-4 pr-5 text-[15px] font-semibold text-navy-950 shadow-xl shadow-black/40 ring-4 ring-gold-400/25 transition group-hover:bg-gold-300 group-focus-visible:ring-white/70">
              <Play className="h-5 w-5 fill-current" /> Watch · {formatTime(SHORT_FILM_DURATION)}
            </span>
          </button>
        )}

        {/* Over the muted loop: the film keeps its top-right corner clear for these. */}
        {mode === 'muted' && (
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <button
              type="button"
              onClick={watchWithSound}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold-400 px-3.5 text-[13px] font-semibold text-navy-950 shadow-lg shadow-black/30 hover:bg-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Volume2 className="h-4 w-4" /> Watch with sound
            </button>
            <button
              type="button"
              onClick={toggleHold}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-950/75 text-white shadow-lg shadow-black/30 ring-1 ring-white/20 backdrop-blur hover:bg-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label={held ? 'Play the film' : 'Pause the film'}
            >
              {held ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
            </button>
          </div>
        )}
      </div>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
        <span className="font-semibold text-white/85">
          {TITLE} · {formatTime(SHORT_FILM_DURATION)}
        </span>
        <a href="/in-30-seconds" className="inline-flex items-center gap-1 font-semibold text-gold-200 hover:text-white">
          Chapters and transcript <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </figcaption>
    </figure>
  );
}
