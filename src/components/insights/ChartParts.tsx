import type { CSSProperties, ReactNode } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import type { Priority } from '../../types';
import { PRIORITIES, PRIORITY_LIST } from '../../lib/taxonomy';
import { cn } from '../../lib/format';
import { Segmented } from '../ui/Form';
import { BAR_FILL, priorityColor } from './viz';
import type { PriorityCounts } from './metrics';

export type ChartView = 'chart' | 'table';

/** Chart ⇄ table switch: every chart has a table twin with the same numbers. */
export function ViewToggle({ value, onChange, subject }: { value: ChartView; onChange: (v: ChartView) => void; subject: string }) {
  return (
    <Segmented<ChartView>
      size="sm"
      label={`Show ${subject} as`}
      value={value}
      onChange={onChange}
      options={[
        {
          value: 'chart',
          label: (
            <>
              <ChartColumn className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Chart</span>
            </>
          ),
        },
        {
          value: 'table',
          label: (
            <>
              <Table2 className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Table</span>
            </>
          ),
        },
      ]}
    />
  );
}

/** Floating readout. Values lead (strong), labels follow (muted). */
export function ChartTooltip({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-xl border border-line bg-surface px-3 py-2.5 shadow-pop"
      style={style}
      aria-hidden
    >
      {children}
    </div>
  );
}

/** Tooltip row keyed by a short stroke of the series colour. */
export function TooltipRow({ color, value, label, muted }: { color: string; value: ReactNode; label: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 text-[12px] leading-5', muted && 'opacity-55')}>
      <span className="h-[3px] w-3 flex-shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-[1.25rem] text-right font-semibold text-ink tabular">{value}</span>
      <span className="truncate text-muted">{label}</span>
    </div>
  );
}

/** Priority legend with each series' total — the identity channel never rests on colour alone. */
export function PriorityLegend({ totals, className }: { totals: PriorityCounts; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5', className)} aria-label="Priority legend">
      {PRIORITY_LIST.map((p: Priority) => (
        <li key={p} className="inline-flex items-center gap-1.5 text-[12px]">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: priorityColor(p) }} aria-hidden />
          <span className="font-semibold text-ink">{PRIORITIES[p].short}</span>
          <span className="text-muted">{PRIORITIES[p].label}</span>
          <span className="font-medium text-ink-2 tabular">{totals[p - 1]}</span>
        </li>
      ))}
    </ul>
  );
}

/** Thin horizontal bar: square at the baseline, 4px rounded data-end. */
export function InlineBar({ fraction, className }: { fraction: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className={cn('h-2 w-full', className)} aria-hidden>
      {pct > 0 && (
        <div className="h-full rounded-r-[4px]" style={{ width: `max(${pct}%, 4px)`, background: BAR_FILL }} />
      )}
    </div>
  );
}

/** One labelled row of a bar list: label + value on top, bar beneath. */
export function BarRow({
  icon,
  label,
  title,
  value,
  fraction,
  share,
  meta,
}: {
  icon?: ReactNode;
  label: ReactNode;
  title?: string;
  value: number;
  fraction: number;
  share?: string;
  meta?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13px] font-medium text-ink" title={title}>
            {label}
          </span>
          <span className="flex-shrink-0 text-[13px] tabular">
            <span className="font-semibold text-ink">{value.toLocaleString()}</span>
            {share && <span className="ml-1.5 inline-block min-w-[2.25rem] text-right text-muted">{share}</span>}
          </span>
        </div>
        <InlineBar fraction={fraction} className="mt-1.5" />
        {meta && <div className="mt-1 text-[12px] text-muted">{meta}</div>}
      </div>
    </li>
  );
}
