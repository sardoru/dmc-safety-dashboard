import { Radio, Mic, FileText, Zap } from 'lucide-react';
import type { CategoryKey, Incident, IncidentStatus, Priority } from '../../types';
import { categoryMeta, PRIORITIES, STATUSES } from '../../lib/taxonomy';
import { cn } from '../../lib/format';

export function PriorityBadge({ priority, withLabel, className }: { priority: Priority; withLabel?: boolean; className?: string }) {
  const p = PRIORITIES[priority];
  return (
    <span
      className={cn(
        'inline-flex h-5 flex-shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-bold tracking-wide tabular',
        p.badge,
        className,
      )}
      title={`${p.short} · ${p.label} — ${p.description}`}
    >
      {p.short}
      {withLabel && <span className="font-semibold">· {p.label}</span>}
    </span>
  );
}

export function StatusPill({
  status,
  reporterView,
  className,
}: {
  status: IncidentStatus;
  reporterView?: boolean;
  className?: string;
}) {
  const s = STATUSES[status];
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        s.pill,
        className,
      )}
      title={s.description}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot, status === 'active' && 'animate-pulse')} />
      {reporterView ? s.reporterLabel : s.label}
    </span>
  );
}

export function CategoryIcon({
  category,
  priority,
  size = 'md',
  className,
}: {
  category: CategoryKey;
  priority?: Priority;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const Icon = categoryMeta(category).icon;
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-12 w-12 rounded-2xl' : 'h-10 w-10 rounded-xl';
  const icon = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';
  const tint =
    priority === 1
      ? 'bg-red-50 text-red-600 dark:bg-red-500/12 dark:text-red-400'
      : priority === 2
        ? 'bg-orange-50 text-orange-600 dark:bg-orange-500/12 dark:text-orange-400'
        : priority === 3
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300'
          : 'bg-surface-3 text-ink-2';
  return (
    <span className={cn('inline-flex flex-shrink-0 items-center justify-center', box, tint, className)} aria-hidden>
      <Icon className={icon} />
    </span>
  );
}

export function KindTag({ kind, source }: { kind: Incident['kind']; source: Incident['source'] }) {
  const Icon = kind === 'voice' ? Mic : kind === 'quick' ? Zap : source === 'officer' ? Radio : FileText;
  const label = kind === 'voice' ? 'Voice interview' : kind === 'quick' ? 'Quick alert' : 'Report form';
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-subtle" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function FlagTags({ incident, className }: { incident: Incident; className?: string }) {
  const flags = [
    incident.happeningNow && { label: 'Happening now', cls: 'bg-red-600 text-white' },
    incident.weaponsSeen && { label: 'Weapon', cls: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300' },
    incident.injuries && { label: 'Injuries', cls: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300' },
    incident.visibility === 'officers' && { label: 'Officers only', cls: 'bg-surface-3 text-ink-2' },
  ].filter(Boolean) as { label: string; cls: string }[];
  if (!flags.length) return null;
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {flags.map((f) => (
        <span key={f.label} className={cn('inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold', f.cls)}>
          {f.label}
        </span>
      ))}
    </span>
  );
}
