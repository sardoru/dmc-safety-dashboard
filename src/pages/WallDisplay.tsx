import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Expand, HeartPulse, Lock, Radio, Siren, TriangleAlert, WifiOff } from 'lucide-react';
import { LogoMark } from '../components/brand/Logo';
import { AutoResize } from '../components/map/IncidentMap';
import { incidentIcon, tileLayerProps } from '../components/map/mapIcons';
import { displayKeyFromLocation, useWallFeed, WALL_REFRESH_MS, type WallCounts, type WallItem } from '../hooks/useWallFeed';
import { DOWNTOWN_CENTER, DOWNTOWN_CORE } from '../lib/geo';
import { categoryMeta, PRIORITIES, STATUSES } from '../lib/taxonomy';
import { cn, timeAgo } from '../lib/format';

/** A report is "new" on the wall for its first ten minutes. */
const FRESH_MS = 10 * 60_000;
const LIST_MAX = 14;

/** A one-second clock for the header and the relative times. */
function useSecond(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/**
 * Wall-screen sizing: everything on this page is in rem, so the root font size follows the screen — about 17 px on
 * a 1080p TV, about 35 px on a 4K one — and comes back when the page closes.
 */
function useTvScale() {
  useEffect(() => {
    const html = document.documentElement;
    const before = html.style.fontSize;
    html.style.fontSize = 'clamp(16px, min(0.9vw, 1.6vh), 40px)';
    return () => {
      html.style.fontSize = before;
    };
  }, []);
}

/** Keep the screen awake while the page is visible (where the browser supports it). */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        lock = null;
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** The cursor (and the full-screen button) fade away after three still seconds. */
function useIdle(ms = 3000): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener('mousemove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', wake);
    };
  }, [ms]);
  return idle;
}

/**
 * Fit the map to downtown and the reports: when the set of reports changes (not on every poll) and whenever the map
 * changes size — the first fit can run before the layout has settled.
 */
function FitReports({ items, maxZoom }: { items: WallItem[]; maxZoom: number }) {
  const map = useMap();
  const latest = useRef(items);
  useEffect(() => {
    latest.current = items;
  });
  const signature = items.map((i) => i.ref).join(',');
  useEffect(() => {
    const fit = () => {
      // The reports themselves (downtown's outline is taller than they are); the outline when there are none.
      const pts = latest.current.map((i) => L.latLng(i.lat, i.lng));
      const bounds = pts.length ? L.latLngBounds(pts) : L.latLngBounds(DOWNTOWN_CORE.map(([a, b]) => L.latLng(a, b)));
      map.fitBounds(bounds, { padding: [70, 70], maxZoom, animate: false });
    };
    map.invalidateSize();
    fit();
    map.on('resize', fit);
    return () => {
      map.off('resize', fit);
    };
  }, [map, signature, maxZoom]);
  return null;
}

/** On a 4K screen the map draws 512-px tiles from one zoom level up, so street names stay readable across a room. */
const BIG_SCREEN = 2400;

function WallMap({ items, now }: { items: WallItem[]; now: number }) {
  // Closed reports underneath, open ones above, the most urgent on top.
  const ordered = useMemo(
    () =>
      [...items].sort((a, b) => {
        const ao = STATUSES[a.status].open ? 1 : 0;
        const bo = STATUSES[b.status].open ? 1 : 0;
        return ao - bo || b.priority - a.priority;
      }),
    [items],
  );
  const big = window.innerWidth >= BIG_SCREEN;
  return (
    <MapContainer
      center={DOWNTOWN_CENTER}
      zoom={15}
      className="tv-map h-full w-full"
      zoomControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      dragging={false}
      keyboard={false}
      touchZoom={false}
      boxZoom={false}
    >
      <TileLayer key={big ? 'big' : 'hd'} {...tileLayerProps(true)} {...(big ? { tileSize: 512, zoomOffset: -1 } : {})} />
      <AutoResize />
      <FitReports items={items} maxZoom={big ? 17 : 16} />
      <Polygon
        positions={DOWNTOWN_CORE}
        pathOptions={{ color: '#c5a55a', weight: 1.5, dashArray: '6 6', fillColor: '#c5a55a', fillOpacity: 0.04 }}
        interactive={false}
      />
      {ordered.map((i) => (
        <Marker
          key={i.ref}
          position={[i.lat, i.lng]}
          icon={incidentIcon(i.category, i, now - i.reportedAt < FRESH_MS)}
          zIndexOffset={STATUSES[i.status].open ? 500 - i.priority * 10 : 0}
          interactive={false}
          keyboard={false}
        />
      ))}
    </MapContainer>
  );
}

function Counter({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'gold' }) {
  return (
    <div className="min-w-[6.5rem] rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-white/55">{label}</p>
      <p
        className={cn(
          'text-[1.9rem] font-bold leading-tight tabular-nums',
          tone === 'red' && value > 0 ? 'text-red-400' : tone === 'gold' ? 'text-gold-300' : 'text-white',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Flag({ icon: Icon, label, className }: { icon: typeof Siren; label: string; className: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.72rem] font-semibold', className)}>
      <Icon className="h-[0.85rem] w-[0.85rem]" aria-hidden />
      {label}
    </span>
  );
}

function ReportRow({ item, now }: { item: WallItem; now: number }) {
  const meta = categoryMeta(item.category);
  const Icon = meta.icon;
  const p = PRIORITIES[item.priority];
  const s = STATUSES[item.status];
  const fresh = now - item.reportedAt < FRESH_MS;
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors',
        fresh ? 'border-gold-400/60 bg-gold-400/[0.08]' : 'border-white/[0.07] bg-white/[0.03]',
        !s.open && 'opacity-60',
      )}
    >
      <span
        className="mt-0.5 inline-flex h-[2.4rem] w-[2.4rem] flex-shrink-0 items-center justify-center rounded-xl text-white"
        style={{ background: p.hex }}
        aria-hidden
      >
        <Icon className="h-[1.2rem] w-[1.2rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[0.78rem] font-semibold text-white/70">
          <span className="rounded px-1.5 py-px font-bold text-white" style={{ background: p.hex }}>
            {p.short}
          </span>
          <span className="truncate">{meta.short}</span>
          {fresh && <span className="rounded bg-gold-400 px-1.5 py-px text-[0.68rem] font-bold uppercase tracking-wider text-navy-900">New</span>}
          {item.officersOnly && <Lock className="h-[0.8rem] w-[0.8rem] text-white/45" aria-label="Officers only" />}
        </div>
        <p className="mt-0.5 line-clamp-2 text-[1.08rem] font-semibold leading-snug text-white">{item.title}</p>
        <p className="mt-0.5 truncate text-[0.82rem] text-white/60">
          {item.place ? `${item.place} · ` : ''}
          {timeAgo(item.reportedAt, now)}
        </p>
        {(item.happeningNow || item.weaponSeen || item.someoneHurt) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {item.happeningNow && <Flag icon={Siren} label="Happening now" className="bg-red-600 text-white" />}
            {item.weaponSeen && <Flag icon={Crosshair} label="Weapon seen" className="bg-red-500/20 text-red-300" />}
            {item.someoneHurt && <Flag icon={HeartPulse} label="Someone hurt" className="bg-red-500/20 text-red-300" />}
          </div>
        )}
      </div>
      <span className={cn('inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ring-1 ring-inset', s.pill)}>
        <span className={cn('h-[0.4rem] w-[0.4rem] rounded-full', s.dot, item.status === 'active' && 'animate-pulse')} />
        {s.label}
      </span>
    </li>
  );
}

function Clock({ now }: { now: number }) {
  const d = new Date(now);
  return (
    <div className="text-right">
      <p className="text-[2rem] font-bold leading-none tabular-nums text-white">
        {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </p>
      <p className="mt-1 text-[0.8rem] font-medium text-white/60">
        {d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}

function Notice({ icon: Icon, title, body }: { icon: typeof Siren; title: string; body: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-[40rem] rounded-3xl border border-white/10 bg-white/[0.04] p-10 text-center">
        <Icon className="mx-auto h-[3rem] w-[3rem] text-gold-300" aria-hidden />
        <h1 className="mt-5 text-[2rem] font-bold text-white">{title}</h1>
        <p className="mt-3 text-[1.1rem] leading-relaxed text-white/70">{body}</p>
      </div>
    </div>
  );
}

/**
 * /tv — the wall display: the live map and the latest reports for a TV on an office wall. Opened with a private
 * link from Admin → Access → Wall displays (/tv#key=…); refreshed every 15 s; no reporter, contact details,
 * descriptions or photos ever reach it.
 */
export default function WallDisplay() {
  const [key] = useState(() => displayKeyFromLocation(window.location));
  const feed = useWallFeed(key);
  const now = useSecond();
  const idle = useIdle();
  useTvScale();
  useWakeLock();

  useEffect(() => {
    const before = document.title;
    document.title = 'Wall display · Core Downtown Memphis Safety Dashboard';
    return () => {
      document.title = before;
    };
  }, []);

  const items = feed.kind === 'ready' ? feed.items : [];
  const counts: WallCounts | null = feed.kind === 'ready' ? feed.counts : null;
  const ageS = feed.kind === 'ready' ? Math.max(0, Math.round((now - feed.fetchedAt) / 1000)) : 0;

  const goFull = () => {
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className={cn('dark h-dvh w-full overflow-hidden bg-[#060911] text-white', idle && 'cursor-none')}>
      <div className="flex h-full flex-col gap-4 p-5">
        <header className="flex flex-shrink-0 items-center gap-5">
          <LogoMark className="h-[3.2rem] w-[3.2rem]" />
          <div className="min-w-0">
            <p className="text-[1.35rem] font-bold leading-tight">Core Downtown Memphis</p>
            <p className="flex items-center gap-2 text-[0.75rem] font-semibold uppercase tracking-[0.2em] text-gold-300">
              <span className="relative inline-flex h-[0.55rem] w-[0.55rem]">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative h-full w-full rounded-full bg-emerald-400" />
              </span>
              Live · Safety dashboard{feed.kind === 'ready' ? ` · ${feed.label}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {counts && (
              <>
                <Counter label="New" value={counts.new} tone="red" />
                <Counter label="Open" value={counts.open} />
                <Counter label="P1–P2 open" value={counts.urgent} tone="red" />
                <Counter label="Last 24 h" value={counts.last24h} />
                <Counter label="Lookouts" value={counts.lookouts} tone="gold" />
              </>
            )}
          </div>
          <Clock now={now} />
        </header>

        <main className="min-h-0 flex-1">
          {feed.kind === 'no-key' ? (
            <Notice
              icon={Lock}
              title="This screen needs a display link"
              body="An administrator makes one in Admin → Access → Wall displays, then opens that link on this screen."
            />
          ) : feed.kind === 'revoked' ? (
            <Notice icon={Lock} title="This display link no longer works" body={`${feed.message} Ask an administrator for a new link.`} />
          ) : feed.kind === 'loading' ? (
            <Notice icon={Radio} title="Connecting…" body="The live map and the latest reports appear in a moment." />
          ) : (
            <div className="grid h-full grid-cols-[minmax(0,1fr)_minmax(24rem,34%)] gap-4">
              <section className="relative min-h-0 overflow-hidden rounded-3xl border border-white/10" aria-label="Map">
                <WallMap items={items} now={now} />
                <div className="pointer-events-none absolute bottom-4 left-4 z-[500] flex items-center gap-3 rounded-xl bg-[#060911]/80 px-3 py-2 text-[0.75rem] font-semibold text-white/80 backdrop-blur">
                  {([1, 2, 3, 4] as const).map((p) => (
                    <span key={p} className="inline-flex items-center gap-1.5">
                      <span className="h-[0.6rem] w-[0.6rem] rounded-full" style={{ background: PRIORITIES[p].hex }} />
                      {PRIORITIES[p].label}
                    </span>
                  ))}
                </div>
              </section>
              <section className="flex min-h-0 flex-col rounded-3xl border border-white/10 bg-white/[0.02] p-4" aria-label="Latest reports">
                <div className="flex items-baseline justify-between gap-3 px-1 pb-3">
                  <h2 className="text-[1.25rem] font-bold">Latest reports</h2>
                  <p className="text-[0.75rem] text-white/50">Open reports, and everything from the last 24 hours</p>
                </div>
                {items.length === 0 ? (
                  <p className="px-1 py-8 text-center text-[1rem] text-white/60">All quiet — no reports in the last 24 hours.</p>
                ) : (
                  <ul className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
                    {items.slice(0, LIST_MAX).map((i) => (
                      <ReportRow key={i.ref} item={i} now={now} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </main>

        <footer className="flex flex-shrink-0 items-center gap-4 text-[0.75rem] text-white/50">
          <span className="inline-flex items-center gap-1.5 font-semibold text-red-300">
            <TriangleAlert className="h-[0.85rem] w-[0.85rem]" aria-hidden /> In danger? Call 911 — this screen is not an emergency line.
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            {feed.kind === 'ready' && feed.stale ? (
              <>
                <WifiOff className="h-[0.85rem] w-[0.85rem] text-amber-300" aria-hidden />
                <span className="text-amber-300">Reconnecting — showing the last update ({ageS} s ago)</span>
              </>
            ) : feed.kind === 'ready' ? (
              feed.demo ? (
                'Sample data · demo mode'
              ) : (
                `Updated ${ageS} s ago · refreshes every ${WALL_REFRESH_MS / 1000} s`
              )
            ) : null}
          </span>
          <button
            type="button"
            onClick={goFull}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 font-semibold text-white/70 transition-opacity hover:text-white',
              idle && 'pointer-events-none opacity-0',
            )}
          >
            <Expand className="h-[0.85rem] w-[0.85rem]" aria-hidden /> Full screen
          </button>
        </footer>
      </div>
    </div>
  );
}
