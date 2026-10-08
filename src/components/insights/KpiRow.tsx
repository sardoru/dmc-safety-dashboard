import type { ReactNode } from 'react';
import { CircleCheck, CircleDot, Inbox, Mic, Minus, Siren, Timer, TrendingDown, TrendingUp } from 'lucide-react';
import { durationShort } from '../../lib/format';
import { Stat } from '../ui/Misc';
import { formatShare, share, type InsightsData } from './metrics';

const ICON = 'h-3.5 w-3.5';
const HINT_ICON = 'mr-1 inline h-3.5 w-3.5 align-[-3px]';

/**
 * "+3 vs prior 7d" — the absolute change (percentages on small counts mislead;
 * it's in the tooltip). Neutral ink: more reports is neither good nor bad on its own.
 */
function changeHint(current: number, previous: number, prior: string, priorLong: string): ReactNode {
  const detail = `${previous.toLocaleString()} ${previous === 1 ? 'report' : 'reports'} in ${priorLong}`;
  if (previous === 0) return <span title={detail}>{current === 0 ? `None in ${prior} either` : `None in ${prior}`}</span>;
  const diff = current - previous;
  if (diff === 0) {
    return (
      <span title={detail}>
        <Minus className={HINT_ICON} aria-hidden />
        Same as {prior}
      </span>
    );
  }
  const pct = Math.round((Math.abs(diff) / previous) * 100);
  const sign = diff > 0 ? '+' : '−';
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span title={`${detail} (${sign}${pct}%)`}>
      <Icon className={HINT_ICON} aria-hidden />
      {sign}
      {Math.abs(diff).toLocaleString()} vs {prior}
    </span>
  );
}

export default function KpiRow({ data }: { data: InsightsData }) {
  const { total } = data;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <Stat
        label="Reports"
        icon={<Inbox className={ICON} />}
        value={total.toLocaleString()}
        hint={changeHint(total, data.prevTotal, data.range.prior, data.range.priorLong)}
      />
      <Stat
        label="Open now"
        icon={<CircleDot className={ICON} />}
        value={data.openNow.toLocaleString()}
        hint={data.awaitingPickup ? `${data.awaitingPickup} awaiting pickup` : 'All picked up'}
        pulse={data.awaitingPickup > 0}
      />
      <Stat
        label="High priority"
        icon={<Siren className={ICON} />}
        value={formatShare(share(data.highCount, total))}
        hint={`${data.highCount} of ${total} were P1–P2`}
      />
      <Stat
        label="Acknowledged in"
        icon={<Timer className={ICON} />}
        value={data.medianAck !== null ? durationShort(data.medianAck) : '—'}
        hint={data.ackCount ? `Median · ${data.ackCount} reports` : 'None acknowledged yet'}
      />
      <Stat
        label="Resolved in"
        icon={<CircleCheck className={ICON} />}
        value={data.medianResolve !== null ? durationShort(data.medianResolve) : '—'}
        hint={data.resolveCount ? `Median · ${data.resolveCount} closed` : 'None closed yet'}
      />
      <Stat
        label="Voice interviews"
        icon={<Mic className={ICON} />}
        value={formatShare(share(data.voiceCount, total))}
        hint={`${data.voiceCount} of ${total} reports`}
      />
    </div>
  );
}
