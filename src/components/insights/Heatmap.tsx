import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { CalendarClock } from 'lucide-react';
import { cn } from '../../lib/format';
import { Card, CardHeader } from '../ui/Card';
import { heatStep, hourRange, hourTick, reportsWord, WEEKDAYS, WEEKDAYS_LONG, type HeatData } from './metrics';
import { HEAT_FILL, useElementSize } from './viz';
import { ChartTooltip, ViewToggle, type ChartView } from './ChartParts';

const LABEL_W = 34;
const TOTAL_W = 34;
const GAP = 2;
const AXIS_H = 20;
const TIP_W = 168;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

interface Cell {
  d: number;
  h: number;
}

function HeatGrid({ heat }: { heat: HeatData }) {
  const [measure, box] = useElementSize<HTMLDivElement>();
  const [active, setActive] = useState<Cell | null>(null);

  const width = box.width;
  const plotW = Math.max(0, width - LABEL_W - TOTAL_W);
  const cw = Math.max(4, (plotW - GAP * 23) / 24);
  // Rows are about as tall as cells are wide; when the card is stretched by a
  // taller neighbour they grow (up to 1.25× the width) to fill it.
  const baseCh = Math.round(Math.min(28, Math.max(12, cw)));
  const naturalH = 7 * baseCh + 6 * GAP + AXIS_H;
  const maxCh = Math.max(baseCh, Math.min(40, Math.round(cw * 1.25)));
  const ch = Math.max(baseCh, Math.min(maxCh, Math.floor((box.height - AXIS_H - 6 * GAP) / 7)));
  const gridH = 7 * ch + 6 * GAP;
  const height = gridH + AXIS_H;
  const hourStep = cw * 3 + GAP * 3 >= 28 ? 3 : 6;
  const maxDay = Math.max(...heat.dayTotals);
  const x = (h: number) => LABEL_W + h * (cw + GAP);
  const y = (d: number) => d * (ch + GAP);

  const cellAt = (e: PointerEvent<SVGSVGElement>): Cell | null => {
    const r = e.currentTarget.getBoundingClientRect();
    const h = Math.floor((e.clientX - r.left - LABEL_W) / (cw + GAP));
    const d = Math.floor((e.clientY - r.top) / (ch + GAP));
    return h >= 0 && h < 24 && d >= 0 && d < 7 ? { d, h } : null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = active ?? { d: 0, h: 0 };
    let next: Cell | null = cur;
    if (e.key === 'ArrowRight') next = { d: cur.d, h: Math.min(23, cur.h + 1) };
    else if (e.key === 'ArrowLeft') next = { d: cur.d, h: Math.max(0, cur.h - 1) };
    else if (e.key === 'ArrowDown') next = { d: Math.min(6, cur.d + 1), h: cur.h };
    else if (e.key === 'ArrowUp') next = { d: Math.max(0, cur.d - 1), h: cur.h };
    else if (e.key === 'Home') next = { d: cur.d, h: 0 };
    else if (e.key === 'End') next = { d: cur.d, h: 23 };
    else if (e.key === 'Escape') next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const count = active ? heat.grid[active.d][active.h] : 0;
  let tipStyle: CSSProperties | null = null;
  if (active && width > 0) {
    const left = Math.min(Math.max(0, x(active.h) + cw / 2 - TIP_W / 2), Math.max(0, width - TIP_W));
    tipStyle =
      active.d <= 1
        ? { left, top: y(active.d) + ch + 8, width: TIP_W }
        : { left, top: y(active.d) - 8, width: TIP_W, transform: 'translateY(-100%)' };
  }

  const summary = heat.peak
    ? `Heatmap of reports by weekday and hour. Busiest: ${WEEKDAYS_LONG[heat.peak.day]} ${hourRange(heat.peak.hour)} with ${reportsWord(heat.peak.count)}.`
    : 'Heatmap of reports by weekday and hour.';

  return (
    <div
      ref={measure}
      tabIndex={0}
      role="group"
      aria-label="Reports by weekday and hour. Use the arrow keys to read each hour."
      onKeyDown={onKeyDown}
      onFocus={() => setActive((a) => a ?? (heat.peak ? { d: heat.peak.day, h: heat.peak.hour } : { d: 0, h: 0 }))}
      onBlur={() => setActive(null)}
      className="relative w-full flex-1 rounded-lg"
      style={{ minHeight: width > 0 ? naturalH : 7 * 14 + AXIS_H }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={summary}
          className="absolute left-0 top-0 block select-none"
          onPointerMove={(e) => setActive(cellAt(e))}
          onPointerDown={(e) => setActive(cellAt(e))}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null);
          }}
        >
          {heat.grid.map((row, d) => (
            <g key={d}>
              <text x={0} y={y(d) + ch / 2} dominantBaseline="central" fontSize={11} fill="var(--muted)">
                {WEEKDAYS[d]}
              </text>
              {row.map((c, h) => (
                <rect
                  key={h}
                  x={x(h)}
                  y={y(d)}
                  width={cw}
                  height={ch}
                  rx={Math.min(3, cw / 3)}
                  fill={HEAT_FILL[heatStep(c, heat.max)]}
                />
              ))}
              <text
                x={width}
                y={y(d) + ch / 2}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={11}
                fontWeight={heat.dayTotals[d] === maxDay && maxDay > 0 ? 600 : 400}
                fill={heat.dayTotals[d] ? 'var(--ink-2)' : 'var(--subtle)'}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {heat.dayTotals[d]}
              </text>
            </g>
          ))}

          {active && (
            <rect
              x={x(active.h) - 1}
              y={y(active.d) - 1}
              width={cw + 2}
              height={ch + 2}
              rx={Math.min(4, cw / 3 + 1)}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={1.5}
            />
          )}

          {HOURS.filter((h) => h % hourStep === 0).map((h) => (
            <text key={h} x={x(h) + cw / 2} y={gridH + 14} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {hourTick(h)}
            </text>
          ))}
          <text x={width} y={gridH + 14} textAnchor="end" fontSize={10} fill="var(--subtle)">
            Total
          </text>
        </svg>
      )}

      {active && tipStyle && (
        <ChartTooltip style={tipStyle}>
          <p className="text-[15px] font-semibold text-ink">{reportsWord(count)}</p>
          <p className="text-[12px] text-muted">
            {WEEKDAYS_LONG[active.d]} · {hourRange(active.h)}
          </p>
        </ChartTooltip>
      )}

      <p className="sr-only" aria-live="polite">
        {active ? `${WEEKDAYS_LONG[active.d]}, ${hourRange(active.h)}: ${reportsWord(count)}.` : ''}
      </p>
    </div>
  );
}

function HeatTable({ heat }: { heat: HeatData }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[760px] border-collapse text-[12px]">
        <caption className="sr-only">Reports by weekday (rows) and hour of day (columns)</caption>
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className="sticky left-0 bg-surface-2 px-2.5 py-2 text-left font-semibold">
              Day
            </th>
            {HOURS.map((h) => (
              <th key={h} scope="col" className="px-1 py-2 text-center font-medium" title={hourRange(h)}>
                {hourTick(h)}
              </th>
            ))}
            <th scope="col" className="px-2.5 py-2 text-right font-semibold">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {heat.grid.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="sticky left-0 bg-surface px-2.5 py-1.5 text-left font-medium text-ink-2">
                {WEEKDAYS[d]}
              </th>
              {row.map((c, h) => (
                <td key={h} className={cn('px-1 py-1.5 text-center tabular', c ? 'font-semibold text-ink' : 'text-subtle')}>
                  {c}
                </td>
              ))}
              <td className="px-2.5 py-1.5 text-right font-semibold text-ink tabular">{heat.dayTotals[d]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HeatmapCard({ heat, className }: { heat: HeatData; className?: string }) {
  const [view, setView] = useState<ChartView>('chart');
  const peak = heat.peak;
  const subtitle =
    peak && peak.count > 1
      ? `Busiest: ${WEEKDAYS_LONG[peak.day]}, ${hourRange(peak.hour)} · ${reportsWord(peak.count)}`
      : 'By day of week and hour the report came in';

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        title="When reports happen"
        subtitle={subtitle}
        icon={<CalendarClock className="h-[18px] w-[18px]" />}
        action={<ViewToggle value={view} onChange={setView} subject="when reports happen" />}
      />
      {view === 'chart' ? (
        <>
          <HeatGrid heat={heat} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              Fewer
              <span className="inline-flex gap-0.5" aria-hidden>
                {HEAT_FILL.map((fill) => (
                  <span key={fill} className="h-3 w-3 rounded-[3px]" style={{ background: fill }} />
                ))}
              </span>
              More
            </span>
            <span className="text-subtle">
              Darkest = {reportsWord(heat.max)} in one hour · local time
            </span>
          </div>
        </>
      ) : (
        <HeatTable heat={heat} />
      )}
    </Card>
  );
}
