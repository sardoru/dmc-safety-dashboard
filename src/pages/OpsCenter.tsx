import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, FlaskConical, Funnel, Inbox, List, Map as MapIcon, Activity, Search, X } from 'lucide-react';
import { useIncidents } from '../context/IncidentContext';
import { useBolos } from '../context/BoloContext';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useRadio } from '../context/RadioContext';
import { useNow } from '../hooks/useNow';
import { useIsDesktop } from '../hooks/useMediaQuery';
import { useBusinesses } from '../hooks/useBusinesses';
import type { CategoryKey, Incident, Priority } from '../types';
import { CATEGORIES, PRIORITIES, PRIORITY_LIST, isOpen } from '../lib/taxonomy';
import { cn, durationShort, median, shortAddress } from '../lib/format';
import IncidentMap, { type MapFocus } from '../components/map/IncidentMap';
import IncidentCard from '../components/incidents/IncidentCard';
import IncidentDetail from '../components/incidents/IncidentDetail';
import ActivityFeed from '../components/incidents/ActivityFeed';
import BriefingPlayer from '../components/voice/BriefingPlayer';
import PoliceScanner from '../components/PoliceScanner';
import { Button } from '../components/ui/Button';
import { Chip, Segmented, Select } from '../components/ui/Form';
import { Banner, EmptyState, Skeleton } from '../components/ui/Feedback';
import { Sheet } from '../components/ui/Overlay';
import ErrorBoundary from '../components/ErrorBoundary';

type View = 'open' | 'all' | 'mine' | 'closed';

function matches(i: Incident, q: string): boolean {
  if (!q) return true;
  const hay = `${i.ref} ${i.title} ${i.description} ${i.address} ${i.reporterName} ${i.categoryLabel}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((t) => hay.includes(t));
}

function Kpi({ label, value, hint, tone, pulse }: { label: string; value: React.ReactNode; hint?: string; tone?: 'danger' | 'warning' | 'accent'; pulse?: boolean }) {
  return (
    <div className="min-w-[112px] flex-shrink-0 rounded-2xl border border-line bg-surface px-3.5 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
        {label}
        {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />}
      </p>
      <p
        className={cn(
          'mt-0.5 text-xl font-bold leading-tight tabular',
          tone === 'danger' ? 'text-red-600 dark:text-red-400' : tone === 'warning' ? 'text-amber-600 dark:text-amber-400' : tone === 'accent' ? 'text-accent-strong' : 'text-ink',
        )}
      >
        {value}
      </p>
      {hint && <p className="truncate text-[11px] text-subtle">{hint}</p>}
    </div>
  );
}

export default function OpsCenter() {
  const now = useNow();
  const desktop = useIsDesktop();
  const { incidents, updates, loading, caps, simulateIncoming } = useIncidents();
  const { activeBolos } = useBolos();
  const { prefs, setPrefs, unlock, audioReady, voiceLabel } = useVoice();
  const { userId, isDemo } = useAuth();
  const { entries: scanner } = useRadio();
  const businesses = useBusinesses();

  const [view, setView] = useState<View>('open');
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [category, setCategory] = useState<CategoryKey | 'all'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [mobileTab, setMobileTab] = useState<'queue' | 'map' | 'activity'>('queue');
  const [showFilters, setShowFilters] = useState(false);

  const selected = selectedId ? incidents.find((i) => i.id === selectedId) ?? null : null;

  // ── KPIs ────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const day = incidents.filter((i) => now - i.createdAt <= 86_400_000);
    const open = incidents.filter((i) => isOpen(i.status));
    const ackTimes = day.filter((i) => i.acknowledgedAt).map((i) => i.acknowledgedAt! - i.createdAt);
    return {
      newCount: incidents.filter((i) => i.status === 'active').length,
      open: open.length,
      urgent: open.filter((i) => i.priority <= 2).length,
      day: day.length,
      ack: median(ackTimes),
    };
  }, [incidents, now]);

  // ── Queue ───────────────────────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      open: incidents.filter((i) => isOpen(i.status)).length,
      all: incidents.length,
      mine: incidents.filter((i) => i.assignedTo && i.assignedTo === userId && isOpen(i.status)).length,
      closed: incidents.filter((i) => !isOpen(i.status)).length,
    }),
    [incidents, userId],
  );

  const queue = useMemo(() => {
    const list = incidents.filter((i) => {
      if (view === 'open' && !isOpen(i.status)) return false;
      if (view === 'closed' && isOpen(i.status)) return false;
      if (view === 'mine' && !(i.assignedTo === userId && isOpen(i.status))) return false;
      if (priorities.length && !priorities.includes(i.priority)) return false;
      if (category !== 'all' && i.category !== category) return false;
      return matches(i, query.trim());
    });
    if (view === 'open' || view === 'mine') {
      const rank = (i: Incident) => (i.status === 'active' ? 0 : i.status === 'responding' ? 1 : 2);
      return list.sort((a, b) => a.priority - b.priority || rank(a) - rank(b) || b.createdAt - a.createdAt);
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [incidents, view, priorities, category, query, userId]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      const inc = incidents.find((i) => i.id === id);
      if (inc) setFocus({ lat: inc.lat, lng: inc.lng, zoom: 17, key: `${id}-${Date.now()}` });
    },
    [incidents],
  );

  // Esc closes the detail panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && desktop) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop]);

  const toggleAlerts = () => {
    unlock();
    setPrefs({ alerts: !prefs.alerts });
    if (!prefs.alerts && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  const filtersActive = priorities.length > 0 || category !== 'all';

  // ── Pieces ──────────────────────────────────────────────────────────────
  const queuePanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 space-y-2.5 border-b border-line p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reports, places, refs…"
              className="input h-9 py-0 pl-9 pr-8 text-[13px]"
              aria-label="Search reports"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:text-ink" aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
              showFilters || filtersActive ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-ink',
            )}
            aria-label="Filters"
            aria-expanded={showFilters}
          >
            <Funnel className="h-4 w-4" />
            {filtersActive && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-accent" />}
          </button>
        </div>
        <Segmented<View>
          size="sm"
          label="Queue view"
          className="w-full [&>button]:flex-1"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'Open', count: counts.open },
            { value: 'mine', label: 'Mine', count: counts.mine },
            { value: 'all', label: 'All' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
        {showFilters && (
          <div className="animate-slide-up space-y-2 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_LIST.map((p) => (
                <Chip
                  key={p}
                  active={priorities.includes(p)}
                  onClick={() => setPriorities((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
                  title={PRIORITIES[p].description}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: PRIORITIES[p].hex }} />
                  {PRIORITIES[p].short} {PRIORITIES[p].label}
                </Chip>
              ))}
            </div>
            <Select value={category} onChange={(e) => setCategory(e.target.value as CategoryKey | 'all')} className="h-9 py-0 text-[13px]" aria-label="Category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
            {filtersActive && (
              <button
                onClick={() => {
                  setPriorities([]);
                  setCategory('all');
                }}
                className="text-[12px] font-semibold text-muted hover:text-ink"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, k) => <Skeleton key={k} className="h-28 rounded-2xl" />)
        ) : queue.length === 0 ? (
          <EmptyState
            compact
            illustration={view === 'open' ? 'illoAllClear' : undefined}
            icon={<Inbox className="h-6 w-6" />}
            title={view === 'open' && !query && !filtersActive ? 'All clear downtown' : 'Nothing matches'}
            body={view === 'open' && !query && !filtersActive ? 'No open reports right now. New reports appear here instantly.' : 'Try a different search or filter.'}
          />
        ) : (
          queue.map((i) => (
            <IncidentCard key={i.id} incident={i} now={now} selected={i.id === selectedId} onClick={() => select(i.id)} />
          ))
        )}
      </div>
    </div>
  );

  const map = (
    <ErrorBoundary label="ops-map">
      <IncidentMap
        incidents={view === 'closed' ? incidents.filter((i) => !isOpen(i.status)) : incidents.filter((i) => isOpen(i.status) || now - i.createdAt < 86_400_000)}
        selectedId={selectedId}
        onSelect={select}
        businesses={businesses}
        bolos={activeBolos}
        focus={focus}
        mpd
      />
    </ErrorBoundary>
  );

  const activity = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-shrink-0 border-b border-line p-3">
        <PoliceScanner />
      </div>
      <div className="flex flex-shrink-0 items-center justify-between px-4 pb-1 pt-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">Live activity</h2>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <ActivityFeed incidents={incidents} updates={updates} scanner={scanner} now={now} onSelect={select} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Command bar */}
      <div className="flex-shrink-0 border-b border-line bg-surface/70 px-3 py-3 backdrop-blur sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow hidden sm:block">Public Safety · Live</p>
            <h1 className="truncate text-lg font-bold tracking-tight text-ink sm:text-2xl">Operations Center</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {simulateIncoming && (
              <Button
                size="sm"
                variant="ghost"
                icon={<FlaskConical className="h-4 w-4" />}
                onClick={() => {
                  unlock();
                  simulateIncoming();
                }}
                title="Simulate an incoming report (demo)"
                aria-label="Simulate report"
              >
                <span className="hidden md:inline">Simulate report</span>
              </Button>
            )}
            <Button
              size="sm"
              variant={prefs.alerts ? 'secondary' : 'ghost'}
              icon={prefs.alerts ? <Bell className="h-4 w-4 text-accent-strong" /> : <BellOff className="h-4 w-4" />}
              onClick={toggleAlerts}
              title={prefs.alerts ? `Spoken alerts on · ${voiceLabel}` : 'Spoken alerts off'}
              aria-label={prefs.alerts ? 'Voice alerts on' : 'Voice alerts off'}
            >
              <span className="hidden md:inline">Voice alerts {prefs.alerts ? 'on' : 'off'}</span>
            </Button>
            <BriefingPlayer compact />
          </div>
        </div>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          <Kpi label="New" value={kpi.newCount} tone={kpi.newCount ? 'danger' : undefined} pulse={kpi.newCount > 0} hint="awaiting pickup" />
          <Kpi label="Open" value={kpi.open} hint="new · ack · responding" />
          <Kpi label="P1–P2 open" value={kpi.urgent} tone={kpi.urgent ? 'warning' : undefined} hint="high priority" />
          <Kpi label="Time to ack" value={durationShort(kpi.ack)} hint="median, last 24h" tone="accent" />
          <Kpi label="Reports 24h" value={kpi.day} hint={`${businesses.length} member businesses`} />
          <Kpi label="Lookouts" value={activeBolos.length} hint="active BOLOs" />
        </div>
        {prefs.alerts && !audioReady && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-navy-200 bg-navy-50 px-3.5 py-2.5 text-navy-700 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-100">
            <Bell className="h-4 w-4 flex-shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] leading-snug">
              <span className="font-semibold">One click to hear spoken alerts.</span>
              <span className="hidden sm:inline"> Browsers need one click before a tab can speak. Voice: {voiceLabel}.</span>
            </p>
            <Button size="xs" onClick={unlock}>
              Enable audio
            </Button>
          </div>
        )}
        {!isDemo && caps.checked && !caps.v2 && (
          <Banner tone="warning" className="mt-3" title="Database migration 0002 not applied">
            Priorities, structured descriptions, the timeline and the Lookout board are limited until an admin runs{' '}
            <code className="font-mono text-[12px]">supabase/migrations/0002_incidents_bolos.sql</code>.
          </Banner>
        )}
      </div>

      {desktop ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-[360px] flex-shrink-0 border-r border-line bg-surface xl:w-[380px]">{queuePanel}</aside>
          <section className="relative min-w-0 flex-1">
            {map}
            {selected && (
              <div className="absolute inset-y-3 right-3 z-[600] flex w-[440px] max-w-[calc(100%-1.5rem)] animate-slide-in-right flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-pop">
                <IncidentDetail key={selected.id} incident={selected} mode="officer" now={now} onClose={() => setSelectedId(null)} />
              </div>
            )}
          </section>
          <aside className="hidden w-[340px] flex-shrink-0 border-l border-line bg-surface 2xl:block">{activity}</aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-shrink-0 border-b border-line bg-surface px-3 py-2">
            <Segmented
              label="Ops view"
              className="w-full [&>button]:flex-1"
              value={mobileTab}
              onChange={setMobileTab}
              options={[
                { value: 'queue', label: 'Queue', icon: <List className="h-4 w-4" />, count: counts.open },
                { value: 'map', label: 'Map', icon: <MapIcon className="h-4 w-4" /> },
                { value: 'activity', label: 'Activity', icon: <Activity className="h-4 w-4" /> },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 bg-surface">
            {mobileTab === 'queue' && queuePanel}
            {mobileTab === 'map' && map}
            {mobileTab === 'activity' && activity}
          </div>
          <Sheet open={Boolean(selected)} onClose={() => setSelectedId(null)} label={selected ? `Report ${selected.ref}` : 'Report'}>
            {selected && <IncidentDetail key={selected.id} incident={selected} mode="officer" now={now} onClose={() => setSelectedId(null)} />}
          </Sheet>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {queue.length} reports in view{selected ? `, ${selected.title} selected at ${shortAddress(selected.address)}` : ''}
      </span>
    </div>
  );
}
