import { MapPin, UserRound, Users, Car, Image as ImageIcon } from 'lucide-react';
import type { Incident } from '../../types';
import { cn, shortAddress, timeAgo } from '../../lib/format';
import { categoryMeta } from '../../lib/taxonomy';
import { CategoryIcon, FlagTags, PriorityBadge, StatusPill } from './Badges';

interface IncidentCardProps {
  incident: Incident;
  now: number;
  selected?: boolean;
  onClick?: () => void;
  /** Reporter's own view: friendlier status wording, no reporter line. */
  reporterView?: boolean;
  distance?: string;
  compact?: boolean;
}

export default function IncidentCard({ incident: i, now, selected, onClick, reporterView, distance, compact }: IncidentCardProps) {
  const fresh = i.status === 'active' && now - i.createdAt < 10 * 60_000;
  // Other members' reports carry a count, not the photos.
  const photoCount = i.photoCount ?? i.photos.length;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'group relative w-full rounded-2xl border p-3.5 text-left transition-all',
        selected
          ? 'border-accent bg-accent-soft/60 shadow-[0_0_0_1px_var(--accent)]'
          : 'border-line bg-surface hover:border-line-strong hover:shadow-[var(--sh-card)]',
        fresh && !selected && 'animate-flash',
      )}
    >
      {i.status === 'active' && i.priority <= 2 && (
        <span className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-red-500" aria-hidden />
      )}
      <div className="flex items-start gap-3">
        <CategoryIcon category={i.category} priority={i.priority} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PriorityBadge priority={i.priority} />
            <span className="truncate text-[12px] font-medium text-muted">{categoryMeta(i.category).short}</span>
            <span className="ml-auto flex-shrink-0 text-[12px] text-subtle tabular">{timeAgo(i.createdAt, now)}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink">{i.title}</p>
          {!compact && (
            <div className="mt-1.5 flex items-center gap-1 text-[12px] text-muted">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-subtle" aria-hidden />
              <span className="truncate">{shortAddress(i.address) || 'Location pending'}</span>
              {distance && <span className="flex-shrink-0 text-subtle">· {distance}</span>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill status={i.status} reporterView={reporterView} />
            <FlagTags incident={i} />
            {!compact && (i.subjects.length > 0 || i.vehicles.length > 0 || photoCount > 0) && (
              <span className="ml-auto inline-flex items-center gap-2 text-[11px] text-subtle">
                {i.subjects.length > 0 && (
                  <span className="inline-flex items-center gap-0.5" title={`${i.subjects.length} described`}>
                    {i.subjects.length > 1 ? <Users className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                    {i.subjects.length}
                  </span>
                )}
                {i.vehicles.length > 0 && (
                  <span className="inline-flex items-center gap-0.5" title="Vehicles">
                    <Car className="h-3.5 w-3.5" />
                    {i.vehicles.length}
                  </span>
                )}
                {photoCount > 0 && (
                  <span className="inline-flex items-center gap-0.5" title="Photos">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {photoCount}
                  </span>
                )}
              </span>
            )}
          </div>
          {!reporterView && !compact && (
            <p className="mt-2 truncate text-[12px] text-subtle">
              {i.source === 'officer' ? 'Officer report' : i.reporterName}
              {i.assignedName && <> · <span className="text-ink-2">{i.assignedName}</span></>}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
