import { format, formatDistanceToNowStrict, isToday, isYesterday } from 'date-fns';

/** Join class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

/** Short, speakable incident reference derived from its id: "DT-4F2A". */
export function incidentRef(id: string): string {
  const hex = id.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `DT-${(hex.slice(0, 4) || '0000').padEnd(4, '0')}`;
}

/** "DT-4F2A" → "D T 4 F 2 A" so a TTS voice spells it out. */
export function spellRef(ref: string): string {
  return ref.replace(/-/g, ' ').split('').join(' ').replace(/\s+/g, ' ').trim();
}

export function timeAgo(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 45_000) return 'just now';
  if (diff < 60 * 60_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return formatDistanceToNowStrict(ts, { addSuffix: true });
}

export function clockTime(ts: number): string {
  return format(ts, 'h:mm a');
}

export function dayTime(ts: number): string {
  if (isToday(ts)) return `Today, ${format(ts, 'h:mm a')}`;
  if (isYesterday(ts)) return `Yesterday, ${format(ts, 'h:mm a')}`;
  return format(ts, 'MMM d, h:mm a');
}

export function fullDateTime(ts: number): string {
  return format(ts, 'EEE, MMM d yyyy · h:mm a');
}

export function durationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const min = Math.round(ms / 60_000);
  if (min < 1) return '<1m';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Shorten a Nominatim display name to "123 Main St, Downtown". */
export function shortAddress(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const drop = /^(memphis|shelby county|tennessee|tn|united states|usa|\d{5}(-\d{4})?|(tn|tennessee)\s+\d{5}(-\d{4})?)$/i;
  return parts.filter((p) => !drop.test(p)).slice(0, 2).join(', ') || parts[0] || address;
}
