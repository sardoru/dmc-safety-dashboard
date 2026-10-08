import { useId, useState } from 'react';
import { format } from 'date-fns';
import {
  CalendarPlus,
  Car,
  ChevronDown,
  CircleCheck,
  Clock,
  Eye,
  Link2,
  MapPin,
  RotateCcw,
  UserSearch,
} from 'lucide-react';
import type { Bolo, Incident } from '../../types';
import { boloReadout } from '../../lib/announce';
import { cn, fullDateTime, shortAddress, timeAgo } from '../../lib/format';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Feedback';
import { PriorityBadge } from '../incidents/Badges';
import ListenButton from '../voice/ListenButton';
import BoloPhoto from './BoloPhoto';
import { boloState, personRows, timeLeft, vehicleRows, type BoloState } from './boloUtils';

export type BoloAction = 'extend' | 'clear' | 'reactivate';

export function BoloStatusChip({ state, expiresAt, now }: { state: BoloState; expiresAt: number; now: number }) {
  const left = expiresAt - now;
  if (state === 'cleared') {
    return (
      <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[12px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden />
        Cleared
      </span>
    );
  }
  if (state === 'expired') {
    return (
      <span
        className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-3 px-2.5 text-[12px] font-semibold text-muted ring-1 ring-inset ring-line-strong"
        title={`Expired ${fullDateTime(expiresAt)}`}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden />
        Expired
      </span>
    );
  }
  const soon = left < 24 * 3_600_000;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        soon
          ? 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25'
          : 'bg-accent-soft text-accent-strong ring-accent/25',
      )}
      title={`Expires ${fullDateTime(expiresAt)}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', soon ? 'bg-amber-500' : 'bg-accent')} aria-hidden />
      Active · expires in {timeLeft(left)}
    </span>
  );
}

/** Compact definition list of what to look for. */
export function BoloDescription({ bolo, className }: { bolo: Bolo; className?: string }) {
  const rows = bolo.kind === 'vehicle' ? vehicleRows(bolo.vehicle) : personRows(bolo.subject);
  if (!rows.length) return null;
  return (
    <dl className={cn('rounded-xl border border-line bg-surface-2 px-3 py-2', className)}>
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-3 py-1">
          <dt className="w-[92px] flex-shrink-0 text-[12px] leading-5 text-subtle">{label}</dt>
          <dd className="min-w-0 text-[13px] leading-5 text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function LinkedReports({ ids, incidents, now }: { ids: string[]; incidents: Map<string, Incident>; now: number }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {ids.map((id) => {
        const inc = incidents.get(id);
        return (
          <li key={id} className="flex items-start gap-2 px-3 py-2">
            {inc ? (
              <>
                <PriorityBadge priority={inc.priority} className="mt-px" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{inc.title}</p>
                  <p className="truncate text-[12px] text-muted">
                    {inc.ref} · {timeAgo(inc.createdAt, now)}
                    {inc.address ? ` · ${shortAddress(inc.address)}` : ''}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted">Report not available</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface BoloCardProps {
  bolo: Bolo;
  now: number;
  officer: boolean;
  incidents: Map<string, Incident>;
  pending: BoloAction | null;
  onSighting: (b: Bolo) => void;
  onAction: (b: Bolo, action: BoloAction) => void;
}

export default function BoloCard({ bolo, now, officer, incidents, pending, onSighting, onAction }: BoloCardProps) {
  const titleId = useId();
  const linkedId = useId();
  const [showLinked, setShowLinked] = useState(false);
  const state = boloState(bolo, now);
  const live = state === 'active';
  const KindIcon = bolo.kind === 'vehicle' ? Car : UserSearch;
  const linkedCount = bolo.incidentIds.length;
  const busy = pending !== null;

  return (
    <article aria-labelledby={titleId} className="card flex flex-col overflow-hidden">
      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <span
          className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
            live ? 'bg-accent-soft text-accent-strong' : 'bg-surface-3 text-subtle',
          )}
          aria-hidden
        >
          <KindIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BoloStatusChip state={state} expiresAt={bolo.expiresAt} now={now} />
            <span className="text-[12px] font-medium text-subtle">{bolo.kind === 'vehicle' ? 'Vehicle' : 'Person'}</span>
          </div>
          <h3 id={titleId} className={cn('mt-1.5 text-[15px] font-semibold leading-snug', live ? 'text-ink' : 'text-ink-2')}>
            {bolo.title}
          </h3>
        </div>
        {bolo.photo && <BoloPhoto photoRef={bolo.photo} title={bolo.title} />}
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 sm:px-5">
        {bolo.summary && <p className="text-[13px] leading-relaxed text-ink-2">{bolo.summary}</p>}
        <BoloDescription bolo={bolo} />

        <div className="flex items-start gap-2.5">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-subtle" aria-hidden />
          <p className="min-w-0 text-[13px] leading-5">
            <span className="text-muted">Last seen </span>
            {bolo.lastSeenLocation ? (
              <span className="font-medium text-ink">{shortAddress(bolo.lastSeenLocation)}</span>
            ) : (
              <span className="text-muted">— no location yet</span>
            )}
            {bolo.lastSeenAt !== undefined && (
              <span className="text-muted" title={fullDateTime(bolo.lastSeenAt)}>
                {' '}
                · {timeAgo(bolo.lastSeenAt, now)}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-subtle" aria-hidden />
            <span className="font-semibold text-ink-2 tabular">{bolo.sightings}</span>
            {bolo.sightings === 1 ? 'sighting' : 'sightings'}
          </span>
          {officer && linkedCount > 0 ? (
            <button
              type="button"
              onClick={() => setShowLinked((v) => !v)}
              aria-expanded={showLinked}
              aria-controls={linkedId}
              className="inline-flex items-center gap-1.5 rounded-md hover:text-ink"
            >
              <Link2 className="h-3.5 w-3.5 text-subtle" aria-hidden />
              <span className="font-semibold text-ink-2 tabular">{linkedCount}</span>
              {linkedCount === 1 ? 'linked report' : 'linked reports'}
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showLinked && 'rotate-180')} aria-hidden />
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-subtle" aria-hidden />
              <span className="font-semibold text-ink-2 tabular">{linkedCount}</span>
              {linkedCount === 1 ? 'linked report' : 'linked reports'}
            </span>
          )}
        </div>
        {officer && showLinked && (
          <div id={linkedId}>
            <LinkedReports ids={bolo.incidentIds} incidents={incidents} now={now} />
          </div>
        )}

        <p className="mt-auto pb-3 text-[12px] text-subtle">
          Posted by {bolo.createdByName} · <span title={fullDateTime(bolo.createdAt)}>{format(bolo.createdAt, 'MMM d')}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:px-5">
        {live && (
          <Button
            size="sm"
            variant={officer ? 'secondary' : 'primary'}
            icon={<Eye className="h-4 w-4" aria-hidden />}
            onClick={() => onSighting(bolo)}
          >
            I&apos;ve seen this
          </Button>
        )}
        <ListenButton text={() => boloReadout(bolo)} speechKey={`bolo-${bolo.id}`} label="Listen" />
        {officer && (
          <div
            role="group"
            aria-label="Manage this notice"
            className="flex w-full flex-wrap items-center gap-1.5 border-t border-line pt-2"
          >
            {state !== 'cleared' && (
              <Button
                size="sm"
                variant="ghost"
                icon={<CalendarPlus className="h-4 w-4" aria-hidden />}
                loading={pending === 'extend'}
                disabled={busy}
                onClick={() => onAction(bolo, 'extend')}
                title={live ? 'Push the expiry back 3 days' : 'Put it back on the board for 3 days'}
              >
                {live ? 'Extend 3 days' : 'Renew 3 days'}
              </Button>
            )}
            {state !== 'cleared' ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<CircleCheck className="h-4 w-4" aria-hidden />}
                loading={pending === 'clear'}
                disabled={busy}
                onClick={() => onAction(bolo, 'clear')}
                title="Take it off the board — e.g. the person was identified"
              >
                Clear
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                icon={<RotateCcw className="h-4 w-4" aria-hidden />}
                loading={pending === 'reactivate'}
                disabled={busy}
                onClick={() => onAction(bolo, 'reactivate')}
              >
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function BoloCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden>
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="border-t border-line bg-surface-2 px-5 py-3">
        <Skeleton className="h-8 w-48 rounded-lg" />
      </div>
    </div>
  );
}

