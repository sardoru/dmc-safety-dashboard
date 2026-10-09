import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CirclePause, EyeOff, MapPinned, Phone, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';
import { useNow } from '../hooks/useNow';
import { usePublicIncidents, type PublicIncident } from '../hooks/usePublicIncidents';
import { categoryMeta, STATUSES } from '../lib/taxonomy';
import { cn, timeAgo } from '../lib/format';
import Logo, { LogoMark } from '../components/brand/Logo';
import { ButtonLink } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Banner, EmptyState } from '../components/ui/Feedback';
import { Segmented } from '../components/ui/Form';
import { LiveDot } from '../components/ui/Misc';
import { CategoryIcon, PriorityBadge, StatusPill } from '../components/incidents/Badges';
import PublicIncidentMap from '../components/map/PublicIncidentMap';
import type { MapFocus } from '../components/map/IncidentMap';

type Hours = '6' | '24' | '48' | '168';
type Show = 'all' | 'open' | 'closed';

const WINDOWS: { value: Hours; label: string }[] = [
  { value: '6', label: '6 h' },
  { value: '24', label: '24 h' },
  { value: '48', label: '48 h' },
  { value: '168', label: '7 days' },
];

const WINDOW_TEXT: Record<Hours, string> = { '6': '6 hours', '24': '24 hours', '48': '48 hours', '168': '7 days' };

/** Public, no sign-in: where reports were filed downtown, and where they stand. */
export default function LiveMap() {
  const { isDemo, signedIn } = useAuth();
  const { settings, loaded } = useAppSettings();
  const now = useNow();
  const [win, setWin] = useState<Hours>('48');
  const [show, setShow] = useState<Show>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const feed = usePublicIncidents(Number(win), isDemo, now);

  const paused = loaded && !settings.publicMapEnabled;
  const delay = settings.publicMapDelayMinutes;

  const counts = useMemo(() => {
    const open = feed.items.filter((i) => STATUSES[i.status].open).length;
    return { all: feed.items.length, open, closed: feed.items.length - open };
  }, [feed.items]);

  const shown = useMemo(
    () => (show === 'all' ? feed.items : feed.items.filter((i) => STATUSES[i.status].open === (show === 'open'))),
    [feed.items, show],
  );

  const pick = (i: PublicIncident) => {
    setSelected(i.ref);
    setFocus({ lat: i.lat, lng: i.lng, zoom: 17, key: i.ref });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Home" className="flex min-w-0 items-center gap-2.5">
            <span className="sm:hidden">
              <LogoMark />
            </span>
            <span className="truncate text-[15px] font-bold tracking-tight text-ink sm:hidden">Downtown Safety</span>
            <span className="hidden sm:block">
              <Logo />
            </span>
          </Link>
          <div className="flex flex-shrink-0 items-center gap-2">
            {!signedIn && (
              <ButtonLink to="/join" variant="ghost" size="sm">
                Join
              </ButtonLink>
            )}
            <ButtonLink to={signedIn ? '/' : '/login'} size="sm">
              {signedIn ? 'Dashboard' : 'Sign in'}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:py-7">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
              {paused ? <CirclePause className="h-3.5 w-3.5" /> : <LiveDot />} Live · Downtown Memphis
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">What’s been reported downtown</h1>
            <p className="mt-2 max-w-2xl text-[15px] text-muted">
              Reports filed on the safety dashboard in the last {WINDOW_TEXT[win]}, and where each one stands. Updated every minute
              {delay > 0 ? `; new reports appear after ${delay} minutes` : ''}.
            </p>
          </div>
          <Segmented label="Time window" value={win} onChange={setWin} options={WINDOWS} />
        </div>

        {paused ? (
          <Card className="mt-6">
            <EmptyState
              icon={<CirclePause className="h-6 w-6" />}
              title="The public map is paused"
              body="The Downtown safety team has turned the public map off for now. Check back later — and if anyone is in danger, call 911."
              action={
                <ButtonLink to="/" variant="secondary">
                  Back to home
                </ButtonLink>
              }
            />
          </Card>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              {feed.error && <Banner tone="warning">{feed.error}</Banner>}
              <div className="card h-[58vh] min-h-[340px] overflow-hidden p-0 lg:h-[calc(100dvh-260px)] lg:min-h-[520px]">
                <PublicIncidentMap incidents={shown} selected={selected} onSelect={setSelected} focus={focus} />
              </div>
              <p className="flex items-center gap-1.5 text-[12px] text-subtle">
                <RefreshCw className={cn('h-3.5 w-3.5', feed.loading && 'animate-spin')} aria-hidden />
                {feed.loading ? 'Loading…' : feed.fetchedAt ? `Updated ${timeAgo(feed.fetchedAt, now)}` : ''}
                {isDemo && ' · sample data'}
              </p>
            </div>

            <aside className="min-w-0 space-y-4">
              <Card padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <h2 className="text-[15px] font-semibold text-ink">Latest reports</h2>
                  <Segmented
                    size="sm"
                    label="Show"
                    value={show}
                    onChange={setShow}
                    options={[
                      { value: 'all', label: 'All', count: counts.all },
                      { value: 'open', label: 'Open', count: counts.open },
                      { value: 'closed', label: 'Resolved', count: counts.closed },
                    ]}
                  />
                </div>
                {shown.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<MapPinned className="h-6 w-6" />}
                    title={feed.loading ? 'Loading reports…' : 'Nothing to show'}
                    body={feed.loading ? undefined : `No ${show === 'all' ? '' : show === 'open' ? 'open ' : 'resolved '}reports in the last ${WINDOW_TEXT[win]}.`}
                    className="border-t border-line"
                  />
                ) : (
                  <ol className="max-h-[60vh] divide-y divide-line overflow-y-auto border-t border-line lg:max-h-[calc(100dvh-420px)] lg:min-h-[280px]">
                    {shown.slice(0, 100).map((i) => (
                      <li key={i.ref}>
                        <button
                          type="button"
                          onClick={() => pick(i)}
                          aria-current={i.ref === selected || undefined}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
                            i.ref === selected && 'bg-accent-soft hover:bg-accent-soft',
                          )}
                        >
                          <CategoryIcon category={i.category} priority={i.priority} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-ink">{categoryMeta(i.category).short}</span>
                              <PriorityBadge priority={i.priority} />
                            </span>
                            <span className="mt-0.5 block text-[12px] text-muted">Reported {timeAgo(i.reportedAt, now)}</span>
                          </span>
                          <StatusPill status={i.status} />
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>

              <Card>
                <p className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
                  <EyeOff className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                  <span>
                    <span className="font-semibold text-ink">Privacy first.</span> The public map shows only the type of report,
                    its status and an approximate spot (about a block). No names, descriptions, photos or addresses — and
                    reports marked for officers only never appear here.
                  </span>
                </p>
              </Card>

              <Banner tone="danger" icon={<Phone className="h-4 w-4" />}>
                In danger or seeing a crime in progress? <span className="font-semibold">Call 911 first.</span> This map is not an
                emergency line.
              </Banner>
            </aside>
          </div>
        )}
      </main>

      <footer className="border-t border-line px-4 py-5 text-center text-[12px] text-subtle sm:px-6">
        Core Downtown Memphis · a self-regulated safety dashboard ·{' '}
        <Link to="/welcome" className="font-medium text-muted hover:text-ink">
          About
        </Link>{' '}
        ·{' '}
        <Link to="/join" className="font-medium text-muted hover:text-ink">
          Join the network
        </Link>
      </footer>
    </div>
  );
}
