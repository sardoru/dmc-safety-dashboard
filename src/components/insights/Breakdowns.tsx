import { FileText, ListChecks, MapPinned, Mic, Radio, Shapes, ShieldCheck, Store, Zap } from 'lucide-react';
import type { CategoryKey, IncidentStatus } from '../../types';
import { categoryMeta, PRIORITY_LIST, STATUSES } from '../../lib/taxonomy';
import { cn, timeAgo } from '../../lib/format';
import { Card, CardHeader } from '../ui/Card';
import { CategoryIcon, PriorityBadge } from '../incidents/Badges';
import { BarRow, InlineBar } from './ChartParts';
import { formatShare, reportsWord, share, type Hotspot, type InsightsData, type PriorityCounts } from './metrics';

const ICON = 'h-[18px] w-[18px]';
const TOP_CATEGORIES = 8;
const TOP_SPOTS = 6;

export function CategoryCard({
  categories,
  total,
  className,
}: {
  categories: { key: CategoryKey; count: number }[];
  total: number;
  className?: string;
}) {
  const top = categories.slice(0, TOP_CATEGORIES);
  const rest = categories.slice(TOP_CATEGORIES);
  const restCount = rest.reduce((sum, c) => sum + c.count, 0);
  const max = top[0]?.count ?? 0;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Reports by category"
        subtitle={categories.length > TOP_CATEGORIES ? `Top ${TOP_CATEGORIES} of ${categories.length} categories` : 'What people are reporting'}
        icon={<Shapes className={ICON} />}
      />
      <ol className="space-y-3">
        {top.map((c) => {
          const meta = categoryMeta(c.key);
          return (
            <BarRow
              key={c.key}
              icon={<CategoryIcon category={c.key} size="sm" />}
              label={meta.short}
              title={meta.label}
              value={c.count}
              fraction={max ? c.count / max : 0}
              share={formatShare(share(c.count, total))}
            />
          );
        })}
      </ol>
      {rest.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
          +{rest.length} more {rest.length === 1 ? 'category' : 'categories'} · {reportsWord(restCount)}
        </p>
      )}
    </Card>
  );
}

export function HotspotsCard({ hotspots, now, className }: { hotspots: Hotspot[]; now: number; className?: string }) {
  const top = hotspots.slice(0, TOP_SPOTS);
  const max = top[0]?.count ?? 0;
  const repeat = hotspots.filter((h) => h.count > 1).length;

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Hotspots"
        subtitle={
          repeat
            ? `${repeat} ${repeat === 1 ? 'location has' : 'locations have'} more than one report`
            : `${hotspots.length} locations, none with repeat reports`
        }
        icon={<MapPinned className={ICON} />}
      />
      <ol className="space-y-3.5">
        {top.map((s, i) => (
          <li key={s.place} className="flex items-start gap-3">
            <span className="mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[11px] font-bold text-ink-2 tabular">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-[13px] font-medium text-ink" title={s.place}>
                  {s.place}
                </p>
                <span className="flex-shrink-0 text-[13px] font-semibold text-ink tabular">{s.count}</span>
              </div>
              <InlineBar fraction={max ? s.count / max : 0} className="mt-1.5" />
              <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
                <PriorityBadge priority={s.worst} />
                <span className="truncate">
                  {categoryMeta(s.topCategory).short} · latest {timeAgo(s.last, now)}
                </span>
              </p>
            </div>
          </li>
        ))}
      </ol>
      {hotspots.length > TOP_SPOTS && (
        <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
          +{hotspots.length - TOP_SPOTS} more {hotspots.length - TOP_SPOTS === 1 ? 'location' : 'locations'} · badge shows the most urgent report at each spot
        </p>
      )}
    </Card>
  );
}

export function StatusCard({
  statuses,
  openByPriority,
  total,
  className,
}: {
  statuses: { status: IncidentStatus; count: number }[];
  openByPriority: PriorityCounts;
  total: number;
  className?: string;
}) {
  const open = statuses.filter((s) => STATUSES[s.status].open).reduce((sum, s) => sum + s.count, 0);
  const closed = total - open;
  const present = statuses.filter((s) => s.count > 0);
  const described = present.map((s) => `${s.count} ${STATUSES[s.status].label}`).join(', ');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Status"
        subtitle={`${open} open · ${closed} closed`}
        icon={<ListChecks className={ICON} />}
      />
      <div
        role="img"
        aria-label={`Status of ${reportsWord(total)}: ${described}.`}
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-[4px]"
      >
        {present.map((s) => (
          <span
            key={s.status}
            className={cn('h-full min-w-1', STATUSES[s.status].dot)}
            style={{ flexGrow: s.count, flexBasis: 0 }}
            title={`${STATUSES[s.status].label}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2.5">
        {statuses.map((s) => (
          <li key={s.status} className={cn('flex items-center gap-2.5 text-[13px]', !s.count && 'opacity-60')}>
            <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUSES[s.status].dot)} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink" title={STATUSES[s.status].description}>
              {STATUSES[s.status].label}
            </span>
            <span className="font-semibold text-ink tabular">{s.count}</span>
            <span className="w-10 text-right text-muted tabular">{formatShare(share(s.count, total))}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-5">
        <h4 className="mb-2 border-t border-line pt-4 text-[12px] font-semibold text-muted">Still open, by priority</h4>
        <ul className="grid grid-cols-4 gap-2">
          {PRIORITY_LIST.map((p) => (
            <li
              key={p}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface-2 px-1 py-2',
                !openByPriority[p - 1] && 'opacity-60',
              )}
            >
              <PriorityBadge priority={p} />
              <span className="text-[15px] font-semibold text-ink tabular">{openByPriority[p - 1]}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

export function SourceCard({
  reporters,
  channels,
  total,
  className,
}: Pick<InsightsData, 'reporters' | 'channels' | 'total'> & { className?: string }) {
  const icon = (Icon: typeof Store) => (
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-2" aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
  const row = (key: string, Icon: typeof Store, label: string, value: number) => (
    <BarRow
      key={key}
      icon={icon(Icon)}
      label={label}
      value={value}
      fraction={total ? value / total : 0}
      share={formatShare(share(value, total))}
    />
  );

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader title="Sources" subtitle="Who filed reports, and how" icon={<Radio className={ICON} />} />
      <h4 className="mb-2 text-[12px] font-semibold text-muted">Reported by</h4>
      <ul className="space-y-3">
        {row('business', Store, 'Businesses', reporters.business)}
        {row('officer', ShieldCheck, 'Officers', reporters.officer)}
      </ul>
      <h4 className="mb-2 mt-5 text-[12px] font-semibold text-muted">Channel</h4>
      <ul className="space-y-3">
        {row('voice', Mic, 'Voice interview', channels.voice)}
        {row('form', FileText, 'Report form', channels.form)}
        {row('quick', Zap, 'Quick alert', channels.quick)}
      </ul>
    </Card>
  );
}
