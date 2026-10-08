import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive, Database, Hand, Plus, ScanEye } from 'lucide-react';
import type { Bolo } from '../types';
import { useAuth } from '../context/AuthContext';
import { useBolos } from '../context/BoloContext';
import { useIncidents } from '../context/IncidentContext';
import { useToast } from '../context/ToastContext';
import { bumpNow, useNow } from '../hooks/useNow';
import { plural } from '../lib/format';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Banner, EmptyState } from '../components/ui/Feedback';
import { Segmented } from '../components/ui/Form';
import BoloCard, { BoloCardSkeleton, type BoloAction } from '../components/bolo/BoloCard';
import NewBoloDialog from '../components/bolo/NewBoloDialog';
import SightingDialog from '../components/bolo/SightingDialog';
import { boloState } from '../components/bolo/boloUtils';

type Filter = 'active' | 'archive';

const DAY = 86_400_000;
const EXTEND_DAYS = 3;

export default function BoloBoard() {
  const { bolos, activeBolos, available, loading, setBoloStatus, extendBolo } = useBolos();
  const { incidents } = useIncidents();
  const { isOfficer } = useAuth();
  const { push } = useToast();
  const now = useNow();

  const [filter, setFilter] = useState<Filter>('active');
  const [creating, setCreating] = useState(false);
  const [sighting, setSighting] = useState<Bolo | null>(null);
  const [pending, setPending] = useState<{ id: string; action: BoloAction } | null>(null);

  const incidentMap = useMemo(() => new Map(incidents.map((i) => [i.id, i])), [incidents]);
  const active = isOfficer ? bolos.filter((b) => boloState(b, now) === 'active') : activeBolos;
  const archive = isOfficer ? bolos.filter((b) => boloState(b, now) !== 'active') : [];
  const showArchive = isOfficer && filter === 'archive';
  const shown = showArchive ? archive : active;

  const runAction = async (b: Bolo, action: BoloAction) => {
    setPending({ id: b.id, action });
    try {
      if (action === 'extend') {
        const wasActive = boloState(b, Date.now()) === 'active';
        const until = Math.max(Date.now(), b.expiresAt) + EXTEND_DAYS * DAY;
        await extendBolo(b.id, EXTEND_DAYS);
        push({
          tone: 'success',
          title: wasActive ? 'Lookout extended' : 'Lookout renewed',
          body: `“${b.title}” now runs until ${format(until, 'EEE, MMM d')}.`,
        });
      } else if (action === 'clear') {
        await setBoloStatus(b.id, 'cleared');
        push({
          tone: 'success',
          title: 'Lookout cleared',
          body: 'Businesses no longer see it. You’ll find it under Cleared & expired.',
          action: {
            label: 'Undo',
            onClick: () => {
              void setBoloStatus(b.id, 'active').catch(() => undefined);
            },
          },
        });
      } else if (b.expiresAt <= Date.now()) {
        await extendBolo(b.id, EXTEND_DAYS);
        push({ tone: 'success', title: 'Lookout reactivated', body: `Back on the board for ${EXTEND_DAYS} days.` });
      } else {
        await setBoloStatus(b.id, 'active');
        push({ tone: 'success', title: 'Lookout reactivated', body: 'It’s back on the board for downtown businesses.' });
      }
      bumpNow();
    } catch (err) {
      push({
        tone: 'danger',
        title: 'Couldn’t update the lookout',
        body: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setPending(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Be on the lookout"
        title="Lookout board"
        description="Notices from Downtown public safety about people and vehicles tied to recent incidents. If you spot a match, report the sighting here — officers are alerted right away."
        actions={
          isOfficer && available ? (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
              New BOLO
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {!available && (
          <Banner tone="warning" icon={<Database className="h-4.5 w-4.5" aria-hidden />} title="The lookout board isn’t set up yet">
            An administrator needs to run{' '}
            <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-[12px] dark:bg-white/10">
              supabase/migrations/0002_incidents_bolos.sql
            </code>{' '}
            in the Supabase SQL editor. Notices will appear here as soon as it’s applied.
          </Banner>
        )}
        <Banner icon={<Hand className="h-4.5 w-4.5" aria-hidden />} title="Observe and report — never approach">
          Notices describe behavior, clothing and vehicles. Never approach, follow or confront anyone — report a sighting
          here, and call 911 if anyone is in danger.
        </Banner>
      </div>

      {isOfficer && available && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Segmented<Filter>
            label="Show notices"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Active', count: active.length },
              { value: 'archive', label: 'Cleared & expired', count: archive.length },
            ]}
          />
          {!showArchive && active.length > 0 && (
            <p className="text-[13px] text-muted">
              {plural(active.reduce((sum, b) => sum + b.sightings, 0), 'sighting')} across{' '}
              {plural(active.length, 'active notice')}
            </p>
          )}
        </div>
      )}

      <section aria-label={showArchive ? 'Cleared and expired notices' : 'Active notices'} className="mt-4">
        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <BoloCardSkeleton key={i} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <Card>
            {showArchive ? (
              <EmptyState
                compact
                illustration="illoLookout"
                icon={<Archive className="h-6 w-6" />}
                title="Nothing cleared or expired yet"
                body="Notices move here when an officer clears them or they reach their expiry date."
              />
            ) : (
              <EmptyState
                illustration="illoLookout"
                icon={<ScanEye className="h-6 w-6" />}
                title="No active lookouts"
                body={
                  isOfficer
                    ? 'Post a notice when a person or vehicle is tied to recent incidents, so downtown businesses can keep watch.'
                    : 'When public safety posts a notice about a person or vehicle to watch for, it will show up here.'
                }
                action={
                  isOfficer && available ? (
                    <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
                      New BOLO
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((b) => (
              <BoloCard
                key={b.id}
                bolo={b}
                now={now}
                officer={isOfficer}
                incidents={incidentMap}
                pending={pending?.id === b.id ? pending.action : null}
                onSighting={setSighting}
                onAction={(bolo, action) => void runAction(bolo, action)}
              />
            ))}
          </div>
        )}
      </section>

      {creating && <NewBoloDialog onClose={() => setCreating(false)} />}
      {sighting && <SightingDialog key={sighting.id} bolo={sighting} onClose={() => setSighting(null)} />}
    </PageContainer>
  );
}
