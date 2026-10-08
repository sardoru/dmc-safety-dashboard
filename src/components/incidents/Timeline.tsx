import { ArrowRightLeft, CircleDot, Eye, Flag, Lock, MessageSquareText, Radio, UserCheck } from 'lucide-react';
import type { IncidentUpdate } from '../../types';
import { clockTime, cn, dayTime, timeAgo } from '../../lib/format';

const KIND_ICON = {
  note: MessageSquareText,
  status: ArrowRightLeft,
  assignment: UserCheck,
  priority: Flag,
  system: Radio,
  sighting: Eye,
} as const;

interface TimelineProps {
  updates: IncidentUpdate[];
  now: number;
  /** Hide internal officer notes (reporters / community). */
  hideInternal?: boolean;
  emptyLabel?: string;
}

export default function Timeline({ updates, now, hideInternal, emptyLabel = 'No updates yet.' }: TimelineProps) {
  const list = (hideInternal ? updates.filter((u) => !u.internal) : updates).slice().sort((a, b) => a.createdAt - b.createdAt);
  if (!list.length) return <p className="py-2 text-[13px] text-subtle">{emptyLabel}</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
      {list.map((u) => {
        const Icon = KIND_ICON[u.kind] ?? CircleDot;
        return (
          <li key={u.id} className="relative flex gap-3">
            <span
              className={cn(
                'relative z-[1] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border',
                u.kind === 'status'
                  ? 'border-accent/40 bg-accent-soft text-accent-strong'
                  : u.internal
                    ? 'border-line bg-surface-3 text-muted'
                    : 'border-line bg-surface text-ink-2',
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-subtle">
                <span className="font-semibold text-ink-2">{u.authorName}</span>
                <span title={dayTime(u.createdAt)}>{now - u.createdAt < 86_400_000 ? clockTime(u.createdAt) : dayTime(u.createdAt)}</span>
                <span>· {timeAgo(u.createdAt, now)}</span>
                {u.internal && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    <Lock className="h-3 w-3" /> Internal
                  </span>
                )}
              </p>
              <p className={cn('mt-0.5 text-[13px] leading-relaxed', u.kind === 'note' ? 'text-ink' : 'text-ink-2')}>{u.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
