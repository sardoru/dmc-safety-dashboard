import { addDays, addHours, differenceInCalendarDays, format, getDay, getHours, startOfDay, startOfHour } from 'date-fns';
import type { CategoryKey, Incident, IncidentStatus, Priority } from '../../types';
import { isOpen, PRIORITY_LIST } from '../../lib/taxonomy';
import { median, shortAddress } from '../../lib/format';

/**
 * Pure aggregation for the Insights page. Windows are calendar-aligned so the
 * bars always add up to the headline number: "24h" is the last 24 clock hours
 * (current hour included), "7 days" / "30 days" are whole calendar days ending
 * today. The comparison period is the equal-length window just before.
 */

export type RangeKey = '24h' | '7d' | '30d';
export type BucketUnit = 'hour' | 'day';

export interface RangeMeta {
  key: RangeKey;
  /** Segmented-control label. */
  option: string;
  /** "the last 7 days" — used in sentences. */
  phrase: string;
  /** "prior 7d" — the comparison period, compact enough for a stat tile. */
  prior: string;
  /** "the 7 days before" — the comparison period in a sentence. */
  priorLong: string;
  unit: BucketUnit;
  buckets: number;
}

export const RANGES: Record<RangeKey, RangeMeta> = {
  '24h': { key: '24h', option: '24h', phrase: 'the last 24 hours', prior: 'prior 24h', priorLong: 'the 24 hours before', unit: 'hour', buckets: 24 },
  '7d': { key: '7d', option: '7 days', phrase: 'the last 7 days', prior: 'prior 7d', priorLong: 'the 7 days before', unit: 'day', buckets: 7 },
  '30d': { key: '30d', option: '30 days', phrase: 'the last 30 days', prior: 'prior 30d', priorLong: 'the 30 days before', unit: 'day', buckets: 30 },
};

export const RANGE_ORDER: RangeKey[] = ['24h', '7d', '30d'];

export interface TimeWindow {
  start: number;
  end: number;
  prevStart: number;
  bucketStarts: number[];
}

export function rangeWindow(key: RangeKey, now: number): TimeWindow {
  const meta = RANGES[key];
  if (meta.unit === 'hour') {
    const last = startOfHour(now);
    const bucketStarts = Array.from({ length: meta.buckets }, (_, i) => addHours(last, i - (meta.buckets - 1)).getTime());
    const start = bucketStarts[0];
    return { start, end: addHours(last, 1).getTime(), prevStart: addHours(start, -meta.buckets).getTime(), bucketStarts };
  }
  const today = startOfDay(now);
  const bucketStarts = Array.from({ length: meta.buckets }, (_, i) => addDays(today, i - (meta.buckets - 1)).getTime());
  const start = bucketStarts[0];
  return { start, end: addDays(today, 1).getTime(), prevStart: addDays(start, -meta.buckets).getTime(), bucketStarts };
}

// ── Shapes ───────────────────────────────────────────────────────────────────

export type PriorityCounts = [number, number, number, number];

export interface Bucket {
  start: number;
  /** Counts for P1..P4 (index = priority - 1). */
  counts: PriorityCounts;
  total: number;
}

export interface Hotspot {
  place: string;
  count: number;
  last: number;
  topCategory: CategoryKey;
  /** Most urgent priority reported here. */
  worst: Priority;
}

export interface HeatData {
  /** [weekday Mon=0..Sun=6][hour 0..23] */
  grid: number[][];
  max: number;
  dayTotals: number[];
  peak: { day: number; hour: number; count: number } | null;
}

export interface InsightsData {
  range: RangeMeta;
  window: TimeWindow;
  total: number;
  prevTotal: number;
  /** Across every report, regardless of range. */
  openNow: number;
  awaitingPickup: number;
  highCount: number;
  medianAck: number | null;
  ackCount: number;
  medianResolve: number | null;
  resolveCount: number;
  voiceCount: number;
  buckets: Bucket[];
  priorityTotals: PriorityCounts;
  /** Reports from this range that are still open, by priority. */
  openByPriority: PriorityCounts;
  categories: { key: CategoryKey; count: number }[];
  hotspots: Hotspot[];
  heat: HeatData;
  statuses: { status: IncidentStatus; count: number }[];
  reporters: { business: number; officer: number };
  channels: { voice: number; form: number; quick: number };
}

const STATUS_ORDER: IncidentStatus[] = ['active', 'acknowledged', 'responding', 'resolved', 'dismissed'];

// ── Aggregation ──────────────────────────────────────────────────────────────

export function computeInsights(incidents: Incident[], key: RangeKey, now: number): InsightsData {
  const range = RANGES[key];
  const window = rangeWindow(key, now);
  const inRange = incidents.filter((i) => i.createdAt >= window.start && i.createdAt < window.end);
  const prevTotal = incidents.filter((i) => i.createdAt >= window.prevStart && i.createdAt < window.start).length;

  const buckets: Bucket[] = window.bucketStarts.map((start) => ({ start, counts: [0, 0, 0, 0], total: 0 }));
  const priorityTotals: PriorityCounts = [0, 0, 0, 0];
  const openByPriority: PriorityCounts = [0, 0, 0, 0];
  const categoryCounts = new Map<CategoryKey, number>();
  const statusCounts = new Map<IncidentStatus, number>();
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const places = new Map<string, { count: number; last: number; worst: Priority; cats: Map<CategoryKey, number> }>();
  const reporters = { business: 0, officer: 0 };
  const channels = { voice: 0, form: 0, quick: 0 };
  const ackTimes: number[] = [];
  const resolveTimes: number[] = [];
  let highCount = 0;

  for (const inc of inRange) {
    const idx =
      range.unit === 'hour'
        ? Math.floor((inc.createdAt - window.start) / 3_600_000)
        : differenceInCalendarDays(inc.createdAt, window.start);
    const bucket = buckets[idx];
    if (bucket) {
      bucket.counts[inc.priority - 1] += 1;
      bucket.total += 1;
    }
    priorityTotals[inc.priority - 1] += 1;
    if (isOpen(inc.status)) openByPriority[inc.priority - 1] += 1;
    if (inc.priority <= 2) highCount += 1;

    categoryCounts.set(inc.category, (categoryCounts.get(inc.category) ?? 0) + 1);
    statusCounts.set(inc.status, (statusCounts.get(inc.status) ?? 0) + 1);

    const weekday = (getDay(inc.createdAt) + 6) % 7;
    grid[weekday][getHours(inc.createdAt)] += 1;

    const place = shortAddress(inc.address) || 'Location not given';
    const spot = places.get(place) ?? { count: 0, last: 0, worst: 4 as Priority, cats: new Map<CategoryKey, number>() };
    spot.count += 1;
    spot.last = Math.max(spot.last, inc.createdAt);
    spot.worst = Math.min(spot.worst, inc.priority) as Priority;
    spot.cats.set(inc.category, (spot.cats.get(inc.category) ?? 0) + 1);
    places.set(place, spot);

    reporters[inc.source === 'officer' ? 'officer' : 'business'] += 1;
    if (inc.kind === 'voice') channels.voice += 1;
    else if (inc.kind === 'quick') channels.quick += 1;
    else channels.form += 1;

    if (inc.acknowledgedAt !== undefined && inc.acknowledgedAt >= inc.createdAt) ackTimes.push(inc.acknowledgedAt - inc.createdAt);
    if (inc.resolvedAt !== undefined && inc.resolvedAt >= inc.createdAt) resolveTimes.push(inc.resolvedAt - inc.createdAt);
  }

  const categories = [...categoryCounts.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  const hotspots: Hotspot[] = [...places.entries()]
    .map(([place, s]) => ({
      place,
      count: s.count,
      last: s.last,
      worst: s.worst,
      topCategory: [...s.cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.worst - b.worst || b.last - a.last);

  let max = 0;
  let peak: HeatData['peak'] = null;
  grid.forEach((row, day) =>
    row.forEach((count, hour) => {
      if (count > max) {
        max = count;
        peak = { day, hour, count };
      }
    }),
  );

  const open = incidents.filter((i) => isOpen(i.status));

  return {
    range,
    window,
    total: inRange.length,
    prevTotal,
    openNow: open.length,
    awaitingPickup: open.filter((i) => i.status === 'active').length,
    highCount,
    medianAck: ackTimes.length ? median(ackTimes) : null,
    ackCount: ackTimes.length,
    medianResolve: resolveTimes.length ? median(resolveTimes) : null,
    resolveCount: resolveTimes.length,
    voiceCount: channels.voice,
    buckets,
    priorityTotals,
    openByPriority,
    categories,
    hotspots,
    heat: { grid, max, dayTotals: grid.map((row) => row.reduce((a, b) => a + b, 0)), peak },
    statuses: STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 })),
    reporters,
    channels,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function h12(h: number): number {
  const x = h % 12;
  return x === 0 ? 12 : x;
}

function meridiem(h: number): 'AM' | 'PM' {
  return h % 24 < 12 ? 'AM' : 'PM';
}

/** Compact axis label: 0 → "12a", 15 → "3p". */
export function hourTick(h: number): string {
  return `${h12(h)}${meridiem(h) === 'AM' ? 'a' : 'p'}`;
}

/** "3–4 PM", "11 AM–12 PM". */
export function hourRange(h: number): string {
  const a = h % 24;
  const b = (h + 1) % 24;
  return meridiem(a) === meridiem(b) ? `${h12(a)}–${h12(b)} ${meridiem(b)}` : `${h12(a)} ${meridiem(a)}–${h12(b)} ${meridiem(b)}`;
}

function dayName(ts: number, now: number): string {
  const diff = differenceInCalendarDays(ts, now);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return format(ts, 'EEE, MMM d');
}

/** Full label for a bucket (tooltip, table row). */
export function bucketLabel(start: number, unit: BucketUnit, now: number): string {
  if (unit === 'day') return dayName(start, now);
  return `${dayName(start, now)} · ${hourRange(getHours(start))}`;
}

/** Short x-axis label for a bucket. */
export function bucketTick(start: number, key: RangeKey): string {
  if (key === '24h') return hourTick(getHours(start));
  if (key === '7d') return format(start, 'EEE d');
  return format(start, 'MMM d');
}

/** Which bucket indexes get an x-axis label, given the room each one has. */
export function tickIndexes(starts: number[], key: RangeKey, slot: number): number[] {
  const n = starts.length;
  if (key === '24h') {
    const step = [1, 2, 3, 6, 12].find((s) => s * slot >= 30) ?? 12;
    return starts.map((s, i) => (getHours(s) % step === 0 ? i : -1)).filter((i) => i >= 0);
  }
  const step = [1, 2, 3, 5, 7, 10, 15].find((s) => s * slot >= 46) ?? 15;
  // Anchor on the last bucket so "today" always carries a label.
  return starts.map((_, i) => ((n - 1 - i) % step === 0 ? i : -1)).filter((i) => i >= 0);
}

/** Clean integer y-axis ticks from 0 to at least `max`. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / target;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= rough) ?? 10 * pow);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return ticks;
}

/** Sequential step (0 = none, 1..4) for a heatmap count. */
export function heatStep(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4))) as 1 | 2 | 3 | 4;
}

export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export function formatShare(value: number | null): string {
  if (value === null) return '—';
  const pct = value * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

export function reportsWord(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? 'report' : 'reports'}`;
}

export function describeCounts(counts: PriorityCounts): string {
  return PRIORITY_LIST.map((p) => `P${p} ${counts[p - 1]}`).join(', ');
}
