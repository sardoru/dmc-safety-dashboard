import { useMemo } from 'react';
import { ArrowRightLeft, Flag, MessageSquareText, Radio, RadioTower, SquarePen, UserCheck, Eye } from 'lucide-react';
import type { Incident, IncidentUpdate, RadioEntry } from '../../types';
import { clockTime, cn, timeAgo } from '../../lib/format';
import { categoryMeta } from '../../lib/taxonomy';
import { PriorityBadge } from './Badges';

type FeedItem =
  | { kind: 'report'; at: number; incident: Incident }
  | { kind: 'update'; at: number; update: IncidentUpdate; incident?: Incident }
  | { kind: 'scanner'; at: number; entry: RadioEntry };

const UPDATE_ICON = {
  note: MessageSquareText,
  status: ArrowRightLeft,
  assignment: UserCheck,
  priority: Flag,
  system: Radio,
  sighting: Eye,
} as const;

interface ActivityFeedProps {
  incidents: Incident[];
  updates: Record<string, IncidentUpdate[]>;
  scanner?: RadioEntry[];
  now: number;
  onSelect?: (id: string) => void;
  limit?: number;
}

/** Everything happening, newest first: new reports, officer updates, scanner traffic. */
export default function ActivityFeed({ incidents, updates, scanner = [], now, onSelect, limit = 80 }: ActivityFeedProps) {
  const items = useMemo<FeedItem[]>(() => {
    const byId = new Map(incidents.map((i) => [i.id, i]));
    const out: FeedItem[] = incidents.map((i) => ({ kind: 'report', at: i.createdAt, incident: i }));
    for (const list of Object.values(updates)) {
      for (const u of list) {
        if (u.kind === 'system') continue;
        out.push({ kind: 'update', at: u.createdAt, update: u, incident: byId.get(u.incidentId) });
      }
    }
    for (const e of scanner) out.push({ kind: 'scanner', at: e.timestamp, entry: e });
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }, [incidents, updates, scanner, limit]);

  if (!items.length) {
    return <p className="px-4 py-8 text-center text-[13px] text-subtle">Activity shows up here as reports come in.</p>;
  }

  return (
    <ol className="divide-y divide-line">
      {items.map((item) => {
        if (item.kind === 'report') {
          const i = item.incident;
          return (
            <li key={`r-${i.id}`}>
              <button type="button" onClick={() => onSelect?.(i.id)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
                  <SquarePen className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] text-subtle">
                    <PriorityBadge priority={i.priority} />
                    New {categoryMeta(i.category).short.toLowerCase()} · {timeAgo(i.createdAt, now)}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium text-ink">{i.title}</span>
                  <span className="block truncate text-[12px] text-muted">{i.reporterName}</span>
                </span>
              </button>
            </li>
          );
        }
        if (item.kind === 'update') {
          const u = item.update;
          const Icon = UPDATE_ICON[u.kind] ?? Radio;
          return (
            <li key={`u-${u.id}`}>
              <button type="button" onClick={() => item.incident && onSelect?.(item.incident.id)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2">
                <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-2">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-subtle">
                    <span className="font-semibold text-ink-2">{u.authorName}</span> · {timeAgo(u.createdAt, now)}
                    {u.internal && ' · internal'}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink">{u.body}</span>
                  {item.incident && <span className="block truncate text-[12px] text-muted">{item.incident.ref} · {item.incident.title}</span>}
                </span>
              </button>
            </li>
          );
        }
        const e = item.entry;
        return (
          <li key={`s-${e.id}`} className="flex gap-3 px-4 py-3">
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                e.urgency === 'emergency' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-navy-50 text-navy-600 dark:bg-navy-500/15 dark:text-navy-100',
              )}
            >
              <RadioTower className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-subtle">
                Scanner · {e.channel} · {clockTime(e.timestamp)}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-ink">{e.text}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
