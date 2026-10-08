import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ChartColumnStacked } from 'lucide-react';
import type { Priority } from '../../types';
import { PRIORITIES, PRIORITY_LIST } from '../../lib/taxonomy';
import { cn } from '../../lib/format';
import { Card, CardHeader } from '../ui/Card';
import {
  bucketLabel,
  bucketTick,
  describeCounts,
  niceTicks,
  reportsWord,
  tickIndexes,
  type Bucket,
  type BucketUnit,
  type PriorityCounts,
  type RangeKey,
} from './metrics';
import { priorityColor, useElementSize } from './viz';
import { ChartTooltip, PriorityLegend, TooltipRow, ViewToggle, type ChartView } from './ChartParts';

/** Total chart height bounds (plot + x-axis band); it grows to fill a stretched card. */
const MIN_H = 230;
const MAX_H = 420;
const PAD_T = 20;
const PAD_B = 26;
const PAD_L = 30;
const PAD_R = 4;
const GAP = 2;
const TIP_W = 184;

interface Segment {
  p: Priority;
  y: number;
  h: number;
}

/** P1 sits on the baseline, P4 on top; a 2px surface gap separates segments. */
function stack(counts: PriorityCounts, y: (v: number) => number): Segment[] {
  const out: Segment[] = [];
  let cum = 0;
  for (const p of PRIORITY_LIST) {
    const c = counts[p - 1];
    if (!c) continue;
    const top = y(cum + c);
    const bottom = y(cum) - (out.length ? GAP : 0);
    const h = Math.max(1, bottom - top);
    out.push({ p, y: bottom - h, h });
    cum += c;
  }
  return out;
}

/** Rect with rounded top corners only (square at the baseline). */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`;
}

interface ChartProps {
  buckets: Bucket[];
  rangeKey: RangeKey;
  unit: BucketUnit;
  now: number;
}

function StackedBars({ buckets, rangeKey, unit, now }: ChartProps) {
  const [measure, box] = useElementSize<HTMLDivElement>();
  const width = box.width;
  const [active, setActive] = useState<number | null>(null);

  const n = buckets.length;
  let maxTotal = 0;
  let peak = -1;
  for (let i = 0; i < n; i++) {
    if (buckets[i].total > 0 && buckets[i].total >= maxTotal) {
      maxTotal = buckets[i].total;
      peak = i;
    }
  }
  const ticks = niceTicks(maxTotal);
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(0, width - PAD_L - PAD_R);
  const slot = n ? plotW / n : 0;
  const barW = Math.min(24, Math.max(3, slot * 0.62));
  const height = Math.min(MAX_H, Math.max(MIN_H, box.height));
  const plotH = height - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (v / yMax) * plotH;
  const cx = (i: number) => PAD_L + slot * (i + 0.5);
  const labelled = tickIndexes(
    buckets.map((b) => b.start),
    rangeKey,
    slot,
  );

  const unitWord = unit === 'hour' ? 'hour' : 'day';
  const summary =
    peak >= 0
      ? `Stacked bar chart of reports per ${unitWord} by priority. Busiest: ${bucketLabel(buckets[peak].start, unit, now)} with ${reportsWord(maxTotal)}.`
      : `Stacked bar chart of reports per ${unitWord} by priority. No reports in this range.`;

  const indexAt = (clientX: number, el: Element): number | null => {
    if (!slot) return null;
    const i = Math.floor((clientX - el.getBoundingClientRect().left - PAD_L) / slot);
    return i >= 0 && i < n ? i : null;
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => setActive(indexAt(e.clientX, e.currentTarget));
  const onPointerLeave = (e: PointerEvent<SVGSVGElement>) => {
    // Touch "leaves" as soon as the finger lifts — keep the readout until the next tap.
    if (e.pointerType === 'mouse') setActive(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    let next: number | null;
    if (e.key === 'ArrowRight') next = active === null ? 0 : Math.min(n - 1, active + 1);
    else if (e.key === 'ArrowLeft') next = active === null ? n - 1 : Math.max(0, active - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    else if (e.key === 'Escape') next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const current = active !== null ? buckets[active] : undefined;
  let tipLeft = 0;
  if (current && active !== null) {
    const x = cx(active);
    tipLeft = x + 14 + TIP_W <= width ? x + 14 : Math.max(0, x - 14 - TIP_W);
  }

  return (
    <div
      ref={measure}
      tabIndex={0}
      role="group"
      aria-label={`Reports per ${unitWord}. Use the left and right arrow keys to read each ${unitWord}.`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((a) => (a === null ? (peak >= 0 ? peak : n - 1) : a))}
      onBlur={() => setActive(null)}
      className="relative w-full flex-1 rounded-lg"
      style={{ minHeight: MIN_H }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          className="absolute left-0 top-0 block select-none overflow-visible"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          {/* Hover band */}
          {active !== null && (
            <rect x={PAD_L + slot * active} y={PAD_T - 6} width={slot} height={plotH + 6} rx={6} fill="var(--surface-3)" opacity={0.75} />
          )}

          {/* Grid + y ticks */}
          {ticks.map((t) => {
            const ty = Math.round(y(t)) + 0.5;
            return (
              <g key={t}>
                <line
                  x1={PAD_L}
                  x2={width - PAD_R}
                  y1={ty}
                  y2={ty}
                  stroke={t === 0 ? 'var(--line-strong)' : 'var(--line)'}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={PAD_L - 8}
                  y={ty}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={11}
                  fill="var(--muted)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {buckets.map((b, i) => {
            if (!b.total) return null;
            const segs = stack(b.counts, y);
            const x = cx(i) - barW / 2;
            return (
              <g key={b.start}>
                {segs.map((s, k) =>
                  k === segs.length - 1 ? (
                    <path key={s.p} d={roundedTop(x, s.y, barW, s.h, 4)} fill={priorityColor(s.p)} />
                  ) : (
                    <rect key={s.p} x={x} y={s.y} width={barW} height={s.h} fill={priorityColor(s.p)} />
                  ),
                )}
              </g>
            );
          })}

          {/* Direct label on the peak only */}
          {peak >= 0 && (
            <text
              x={cx(peak)}
              y={y(maxTotal) - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--ink-2)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {maxTotal}
            </text>
          )}

          {/* X ticks */}
          {labelled.map((i) => {
            const x = cx(i);
            const anchor = x + 16 > width ? 'end' : 'middle';
            return (
              <text
                key={buckets[i].start}
                x={anchor === 'end' ? Math.min(width, x + barW / 2) : x}
                y={PAD_T + plotH + 17}
                textAnchor={anchor}
                fontSize={11}
                fill="var(--muted)"
              >
                {bucketTick(buckets[i].start, rangeKey)}
              </text>
            );
          })}
        </svg>
      )}

      {current && (
        <ChartTooltip style={{ left: tipLeft, top: PAD_T - 6, width: TIP_W }}>
          <p className="text-[12px] font-medium text-muted">{bucketLabel(current.start, unit, now)}</p>
          <p className="mb-1.5 text-[15px] font-semibold text-ink">{reportsWord(current.total)}</p>
          {PRIORITY_LIST.map((p) => (
            <TooltipRow
              key={p}
              color={priorityColor(p)}
              value={current.counts[p - 1]}
              label={`${PRIORITIES[p].short} ${PRIORITIES[p].label}`}
              muted={!current.counts[p - 1]}
            />
          ))}
        </ChartTooltip>
      )}

      <p className="sr-only" aria-live="polite">
        {current ? `${bucketLabel(current.start, unit, now)}: ${reportsWord(current.total)}. ${describeCounts(current.counts)}.` : ''}
      </p>
    </div>
  );
}

function TimeTable({ buckets, unit, now }: Omit<ChartProps, 'rangeKey'>) {
  const rows = [...buckets].reverse();
  return (
    <div className="scrollbar-thin max-h-[300px] overflow-auto rounded-xl border border-line">
      <table className="w-full border-collapse text-[13px]">
        <caption className="sr-only">Reports per {unit} by priority, most recent first</caption>
        <thead className="sticky top-0 z-[1] bg-surface-2 text-[12px] text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-semibold">
              {unit === 'hour' ? 'Hour' : 'Day'}
            </th>
            {PRIORITY_LIST.map((p) => (
              <th key={p} scope="col" className="px-2 py-2 text-right font-semibold" title={PRIORITIES[p].label}>
                {PRIORITIES[p].short}
              </th>
            ))}
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.start}>
              <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-ink-2">
                {bucketLabel(b.start, unit, now)}
              </th>
              {b.counts.map((c, k) => (
                <td key={k} className={cn('px-2 py-1.5 text-right tabular', c ? 'text-ink' : 'text-subtle')}>
                  {c}
                </td>
              ))}
              <td className={cn('px-3 py-1.5 text-right font-semibold tabular', b.total ? 'text-ink' : 'text-subtle')}>{b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportsOverTimeCard({
  buckets,
  rangeKey,
  unit,
  totals,
  now,
  className,
}: ChartProps & { totals: PriorityCounts; className?: string }) {
  const [view, setView] = useState<ChartView>('chart');
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="Reports over time"
        subtitle={`Per ${unit === 'hour' ? 'hour' : 'day'}, stacked by priority`}
        icon={<ChartColumnStacked className="h-[18px] w-[18px]" />}
        action={<ViewToggle value={view} onChange={setView} subject="reports over time" />}
      />
      <PriorityLegend totals={totals} className="mb-3" />
      {view === 'chart' ? (
        <StackedBars buckets={buckets} rangeKey={rangeKey} unit={unit} now={now} />
      ) : (
        <TimeTable buckets={buckets} unit={unit} now={now} />
      )}
    </Card>
  );
}
