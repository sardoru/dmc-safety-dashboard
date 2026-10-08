import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, Link2, ListVideo, Phone, Play, ScrollText } from 'lucide-react';
import Logo from '../components/brand/Logo';
import { buttonClasses } from '../components/ui/styles';
import { cn } from '../lib/format';
import { FILM, type FilmChapter } from './filmData';
import { formatTime, startFromLocation } from './time';

/** Index of the chapter playing at `t` (-1 before the first one). */
function chapterAt(chapters: FilmChapter[], t: number): number {
  let idx = -1;
  chapters.forEach((c, i) => {
    if (c.start <= t + 0.05) idx = i;
  });
  return idx;
}

function TimeButton({ t, onSeek, className }: { t: number; onSeek: (t: number) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onSeek(t)}
      className={cn(
        'shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[12px] font-semibold text-accent-strong tabular-nums hover:bg-accent hover:text-primary-ink',
        className,
      )}
      aria-label={`Play from ${formatTime(t)}`}
    >
      {formatTime(t)}
    </button>
  );
}

export default function FilmPage() {
  const video = useRef<HTMLVideoElement>(null);
  const [startAt] = useState(() => startFromLocation(window.location));
  const [now, setNow] = useState(startAt ?? 0);
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const chapters = FILM.chapters;
  const active = chapterAt(chapters, now);

  const sentences = useMemo(
    () => chapters.flatMap((c, ci) => c.sentences.map((s) => ({ ...s, chapter: ci }))),
    [chapters],
  );
  let activeSentence = -1;
  sentences.forEach((s, i) => {
    if (s.start <= now + 0.05) activeSentence = i;
  });

  // Honour ?t= once the metadata is in (an earlier seek is ignored by some browsers).
  useEffect(() => {
    const v = video.current;
    if (!v || startAt === null) return;
    const apply = () => {
      v.currentTime = Math.min(startAt, Math.max(0, (v.duration || FILM.duration) - 1));
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener('loadedmetadata', apply, { once: true });
    return () => v.removeEventListener('loadedmetadata', apply);
  }, [startAt]);

  /** Jump and play — called inside the click, so play() keeps the user gesture. */
  const seek = useCallback((t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    setNow(t);
    setStarted(true);
    void v.play().catch(() => {});
    window.history.replaceState(null, '', `${window.location.pathname}?t=${Math.floor(t)}`);
  }, []);

  const playFromStart = () => seek(startAt ?? 0);

  const copyMoment = async () => {
    const url = `${window.location.origin}${window.location.pathname}?t=${Math.floor(now)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link', url);
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <a href="/" aria-label="Core Downtown Memphis Safety Dashboard — home" className="min-w-0">
          <Logo />
        </a>
        <a href="/" className={buttonClasses({ variant: 'gold', size: 'sm', className: 'shrink-0' })}>
          <span className="sm:hidden">Dashboard</span>
          <span className="hidden sm:inline">Open the dashboard</span>
        </a>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="max-w-3xl animate-slide-up">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-accent-strong">
            How it works · {formatTime(FILM.duration)}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-5xl">How the Safety Dashboard works</h1>
          <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            A self-regulated safety dashboard for Downtown Memphis: how a business reports what it sees, how the
            Downtown public-safety team responds, and how the whole block stays in the loop.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section aria-label="Film">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-black shadow-pop">
              <video
                ref={video}
                className="aspect-video w-full"
                src={FILM.src}
                poster={FILM.poster}
                controls={started}
                playsInline
                preload="metadata"
                onPlay={() => setStarted(true)}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
              >
                <track kind="captions" src={FILM.captions} srcLang="en" label="English" />
              </video>
              {!started && (
                <button
                  type="button"
                  onClick={playFromStart}
                  className="group absolute inset-0 flex items-start justify-end p-3 sm:p-5"
                  aria-label={startAt ? `Play from ${formatTime(startAt)}` : 'Play the film'}
                >
                  <span className="inline-flex items-center gap-2 rounded-full bg-gold-400 px-4 py-2 text-sm font-bold text-navy-900 shadow-glow transition group-hover:bg-gold-300">
                    <Play className="h-4 w-4 fill-current" />
                    {startAt ? `Watch from ${formatTime(startAt)}` : `Watch · ${formatTime(FILM.duration)}`}
                  </span>
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-muted">
                {active >= 0 ? (
                  <>
                    Now: <span className="font-semibold text-ink">{chapters[active].title}</span>
                  </>
                ) : (
                  'Captions are available in the player.'
                )}
              </p>
              <button type="button" onClick={() => void copyMoment()} className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
                {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                {copied ? 'Link copied' : `Copy link at ${formatTime(now)}`}
              </button>
            </div>
          </section>

          <aside aria-label="Chapters" className="card p-3 lg:sticky lg:top-4">
            <h2 className="flex items-center gap-2 px-2 pb-2 pt-1 text-sm font-bold">
              <ListVideo className="h-4 w-4 text-accent" /> Chapters
            </h2>
            <ol className="space-y-0.5">
              {chapters.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => seek(c.start)}
                    aria-current={i === active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left text-[14px] transition',
                      i === active ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    <span className="w-5 shrink-0 text-right font-mono text-[12px] text-subtle">{i + 1}</span>
                    <span className="min-w-0 flex-1 font-medium">{c.title}</span>
                    <span className="font-mono text-[12px] tabular-nums text-accent-strong">{formatTime(c.start)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        </div>

        <section aria-labelledby="transcript" className="mt-14 max-w-3xl">
          <h2 id="transcript" className="flex items-center gap-2 text-xl font-bold">
            <ScrollText className="h-5 w-5 text-accent" /> Transcript
          </h2>
          <p className="mt-1 text-sm text-muted">Every heading and sentence is a link into the film.</p>
          <div className="mt-6 space-y-8">
            {chapters.map((c, ci) => (
              <article key={c.id} id={c.id} className="scroll-mt-6">
                <h3 className="flex items-center gap-3 text-lg font-semibold">
                  <TimeButton t={c.start} onSeek={seek} />
                  <span className={cn(ci === active && 'text-accent-strong')}>{c.title}</span>
                </h3>
                <p className="mt-3 leading-relaxed text-ink-2">
                  {c.sentences.map((s) => {
                    const i = sentences.findIndex((x) => x.start === s.start && x.chapter === ci && x.text === s.text);
                    return (
                      <button
                        key={`${s.start}-${s.text.slice(0, 12)}`}
                        type="button"
                        onClick={() => seek(s.start)}
                        title={`Play from ${formatTime(s.start)}`}
                        className={cn(
                          'mr-1 rounded px-0.5 text-left transition hover:bg-accent-soft hover:text-ink',
                          i === activeSentence && started && 'bg-accent-soft text-ink',
                        )}
                      >
                        {s.text}
                      </button>
                    );
                  })}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid grid-cols-1 gap-4 rounded-3xl border border-line bg-surface p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 className="text-xl font-bold">Downtown business? Join the network.</h2>
            <p className="mt-1 text-sm text-muted">Sign up with just your email — no passwords — and set up your storefront in a minute.</p>
          </div>
          <a href="/login" className={buttonClasses({ variant: 'gold', size: 'lg' })}>
            <Building2 className="h-5 w-5" /> Register your business
          </a>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Core Downtown Memphis Safety Dashboard — a community safety tool. It is not 911 and does not dispatch emergency
            services.
          </p>
          <a href="tel:911" className="inline-flex items-center gap-2 font-semibold text-ink hover:text-accent-strong">
            <Phone className="h-4 w-4 text-rose-500" /> In danger? Call 911
          </a>
        </div>
      </footer>
    </div>
  );
}
