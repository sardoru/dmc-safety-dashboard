import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, BellOff, Inbox, Keyboard, MapPin, Mic, ScanEye, Store, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useIncidents } from '../context/IncidentContext';
import { useBolos } from '../context/BoloContext';
import { useVoice } from '../context/VoiceContext';
import { useNow } from '../hooks/useNow';
import { distanceMiles, formatDistance } from '../lib/geo';
import { isOpen } from '../lib/taxonomy';
import { subjectLine, vehicleLine } from '../lib/incidentRows';
import { cn, shortAddress, timeAgo } from '../lib/format';
import { PageContainer } from '../components/layout/PageHeader';
import IncidentCard from '../components/incidents/IncidentCard';
import IncidentDetail, { type DetailMode } from '../components/incidents/IncidentDetail';
import IncidentMap from '../components/map/IncidentMap';
import BrandImage from '../components/brand/BrandImage';
import EmergencyContacts from '../components/EmergencyContacts';
import { Button, ButtonLink } from '../components/ui/Button';
import { Card, CardHeader, SectionTitle } from '../components/ui/Card';
import { Banner, EmptyState, Skeleton } from '../components/ui/Feedback';
import { Segmented } from '../components/ui/Form';
import { Sheet } from '../components/ui/Overlay';
import ErrorBoundary from '../components/ErrorBoundary';

const NEARBY_MILES = 0.5;

function greeting(hour: number): string {
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function BusinessHome() {
  const now = useNow();
  const { displayName, userId } = useAuth();
  const { profile } = useProfile();
  const { incidents, loading } = useIncidents();
  const { activeBolos } = useBolos();
  const { prefs, setPrefs, unlock } = useVoice();
  const [tab, setTab] = useState<'mine' | 'nearby'>('mine');
  const [open, setOpen] = useState<{ id: string; mode: DetailMode } | null>(null);

  const mine = useMemo(() => incidents.filter((i) => i.reporterId && i.reporterId === userId), [incidents, userId]);
  const nearby = useMemo(() => {
    if (!profile) return [];
    return incidents
      .filter((i) => i.reporterId !== userId && i.visibility === 'community' && now - i.createdAt < 48 * 3_600_000)
      .map((i) => ({ i, d: distanceMiles(profile.lat, profile.lng, i.lat, i.lng) }))
      .filter((x) => x.d <= NEARBY_MILES)
      .sort((a, b) => b.i.createdAt - a.i.createdAt);
  }, [incidents, profile, userId, now]);

  const activeNearby = nearby.filter((x) => isOpen(x.i.status));
  const openMine = mine.filter((i) => isOpen(i.status)).length;
  const selected = open ? incidents.find((i) => i.id === open.id) : undefined;
  const firstName = displayName.split(' ')[0];

  return (
    <PageContainer wide>
      {/* Hero */}
      <div className="relative mb-6 overflow-hidden rounded-3xl bg-brand-night text-white">
        <BrandImage name="panorama" width={1600} alt="" sizes="100vw" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/90 via-navy-950/60 to-navy-950/20" />
        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="text-[13px] font-semibold text-gold-200">
              {greeting(new Date(now).getHours())}, {firstName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{profile?.businessName ?? 'Your business'}</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-navy-100">
              <span className={cn('h-2 w-2 rounded-full', activeNearby.length ? 'bg-amber-400' : 'bg-emerald-400')} />
              {profile
                ? activeNearby.length
                  ? `${activeNearby.length} active ${activeNearby.length === 1 ? 'alert' : 'alerts'} within half a mile`
                  : 'All quiet within half a mile'
                : 'Set up your storefront to see nearby alerts'}
              {openMine > 0 && ` · ${openMine} of your reports open`}
            </p>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-navy-200">See something? Report it</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { to: '/report?mode=voice', label: 'Talk', icon: Mic, cls: 'bg-gold-400 text-navy-900 hover:bg-gold-300' },
                { to: '/report?mode=form', label: 'Form', icon: Keyboard, cls: 'bg-white/10 text-white hover:bg-white/15 border border-white/15' },
                { to: '/report?mode=quick', label: 'Quick alert', icon: Zap, cls: 'bg-red-600 text-white hover:bg-red-700' },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.to} to={a.to} className={cn('flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-[13px] font-bold transition-colors', a.cls)}>
                    <Icon className="h-5 w-5" />
                    {a.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {!profile && (
        <Banner
          tone="info"
          className="mb-6"
          title="Set up your storefront"
          icon={<Store className="h-4.5 w-4.5" />}
          action={
            <ButtonLink to="/account" size="sm">
              Set up now
            </ButtonLink>
          }
        >
          Add your business name and address so reports can be pinned to your door in one tap and you get alerts for your block.
        </Banner>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        {/* Reports */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Segmented
              label="Reports"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'mine', label: 'My reports', count: mine.length },
                { value: 'nearby', label: 'Nearby', count: nearby.length },
              ]}
            />
            <ButtonLink to="/report" size="sm" variant="secondary" iconRight={<ArrowRight className="h-4 w-4" />}>
              New report
            </ButtonLink>
          </div>
          <div className="space-y-2.5">
            {loading ? (
              Array.from({ length: 3 }).map((_, k) => <Skeleton key={k} className="h-28 rounded-2xl" />)
            ) : tab === 'mine' ? (
              mine.length ? (
                mine.map((i) => <IncidentCard key={i.id} incident={i} now={now} reporterView onClick={() => setOpen({ id: i.id, mode: 'reporter' })} />)
              ) : (
                <Card>
                  <EmptyState
                    illustration="illoReport"
                    icon={<Inbox className="h-6 w-6" />}
                    title="You haven’t filed a report yet"
                    body="When you do, you’ll follow it here — from received to resolved — with notes from the officers."
                    action={
                      <ButtonLink to="/report?mode=voice" icon={<Mic className="h-4 w-4" />}>
                        Try the voice interview
                      </ButtonLink>
                    }
                  />
                </Card>
              )
            ) : nearby.length ? (
              nearby.map(({ i, d }) => (
                <IncidentCard key={i.id} incident={i} now={now} distance={formatDistance(d)} onClick={() => setOpen({ id: i.id, mode: 'community' })} />
              ))
            ) : (
              <Card>
                <EmptyState
                  illustration="illoAllClear"
                  icon={<MapPin className="h-6 w-6" />}
                  title="All quiet nearby"
                  body={profile ? 'No community alerts within half a mile in the last 48 hours.' : 'Set up your storefront to see alerts near you.'}
                />
              </Card>
            )}
          </div>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="text-sm font-semibold text-ink">Your block</h2>
              <span className="text-[12px] text-muted">Last 48 hours</span>
            </div>
            <div className="h-72 border-t border-line">
              <ErrorBoundary label="home-map">
                <IncidentMap
                  incidents={nearby.map((x) => x.i).concat(mine.filter((i) => isOpen(i.status)))}
                  myBusiness={profile ? { lat: profile.lat, lng: profile.lng, name: profile.businessName } : null}
                  bolos={activeBolos}
                  onSelect={(id) => setOpen({ id, mode: mine.some((i) => i.id === id) ? 'reporter' : 'community' })}
                  zoom={16}
                  center={profile ? [profile.lat, profile.lng] : undefined}
                  controls={false}
                  defaultLayers={{ district: false }}
                />
              </ErrorBoundary>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Spoken alerts"
              subtitle="Hear nearby alerts and updates on your reports, read by an ElevenLabs voice."
              icon={prefs.alerts ? <Bell className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
              action={
                <Button
                  size="sm"
                  variant={prefs.alerts ? 'primary' : 'secondary'}
                  onClick={() => {
                    unlock();
                    setPrefs({ alerts: !prefs.alerts });
                  }}
                >
                  {prefs.alerts ? 'On' : 'Turn on'}
                </Button>
              }
              flush
            />
          </Card>

          <Card>
            <SectionTitle
              count={activeBolos.length}
              action={
                <Link to="/bolo" className="text-[13px] font-semibold text-accent-strong hover:underline">
                  View board
                </Link>
              }
            >
              <ScanEye className="h-4 w-4 text-accent-strong" /> Be on the lookout
            </SectionTitle>
            {activeBolos.length ? (
              <ul className="space-y-2">
                {activeBolos.slice(0, 3).map((b) => (
                  <li key={b.id}>
                    <Link to="/bolo" className="block rounded-xl border border-line p-3 transition-colors hover:bg-surface-2">
                      <p className="text-[14px] font-semibold text-ink">{b.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{subjectLine(b.subject) || vehicleLine(b.vehicle)}</p>
                      {b.lastSeenAt && (
                        <p className="mt-1 text-[12px] text-subtle">
                          Last seen {timeAgo(b.lastSeenAt, now)}
                          {b.lastSeenLocation ? ` · ${shortAddress(b.lastSeenLocation)}` : ''}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No active lookouts right now.</p>
            )}
          </Card>

          <Card>
            <SectionTitle>Important numbers</SectionTitle>
            <EmergencyContacts />
          </Card>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setOpen(null)} label="Report details">
        {selected && open && <IncidentDetail key={selected.id} incident={selected} mode={open.mode} now={now} onClose={() => setOpen(null)} />}
      </Sheet>
    </PageContainer>
  );
}
