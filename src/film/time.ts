/** "89", "1:29", "1:02:03", "1m29s", "2h" → seconds; null when unreadable. */
export function parseTime(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(v)) return Number(v);
  const clock = v.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const units = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }
  return null;
}

/** 89 → "1:29" */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The start time a link asks for: `?t=1:29` or `#t=89`. */
export function startFromLocation(loc: Pick<Location, 'search' | 'hash'>): number | null {
  const fromQuery = new URLSearchParams(loc.search).get('t');
  const fromHash = loc.hash.startsWith('#t=') ? loc.hash.slice(3) : null;
  return parseTime(fromQuery ?? fromHash);
}
