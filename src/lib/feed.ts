import type { Incident } from '../types';

/**
 * How the incident list is kept, as plain functions (the API harness checks them).
 *
 * Officers and admins read every report from `reports`. A member business reads its own reports there, every field,
 * and everyone else's community reports from `community_reports` (migration 0007): copies without the reporter,
 * contact details, transcript, photos or internal fields, marked `limited`. A member's own community report has a
 * copy too; the full row always wins over it.
 */

export function sortIncidents(list: Incident[]): Incident[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/** The first load: your own reports in full, then copies of everyone else's. */
export function mergeFeeds(own: Incident[], shared: Incident[]): Incident[] {
  const mine = new Set(own.map((i) => i.id));
  return sortIncidents([...own, ...shared.filter((i) => !mine.has(i.id))]);
}

/** A Realtime change, from `reports` (full rows) or from `community_reports` (copies). */
export type FeedChange =
  | { from: 'reports' | 'community'; type: 'INSERT' | 'UPDATE'; incident: Incident }
  | { from: 'reports' | 'community'; type: 'DELETE'; id: string };

export type FeedEvent =
  | { type: 'created'; incident: Incident }
  | { type: 'updated'; incident: Incident; previous?: Incident };

export interface FeedStep {
  /** The list after the change: the same array when nothing changed. */
  list: Incident[];
  /** What to tell listeners (alerts, spoken updates). None when the report was already known. */
  event?: FeedEvent;
}

export function applyFeedChange(list: Incident[], change: FeedChange): FeedStep {
  if (change.type === 'DELETE') {
    const existing = list.find((i) => i.id === change.id);
    // A copy going away (deleted, or no longer shared) never takes your own report with it.
    if (!existing || (change.from === 'community' && !existing.limited)) return { list };
    return { list: list.filter((i) => i.id !== change.id) };
  }

  const inc = change.incident;
  const existing = list.find((i) => i.id === inc.id);
  // Your own report is here in full: its copy adds nothing.
  if (change.from === 'community' && existing && !existing.limited) return { list };

  if (change.type === 'INSERT') {
    if (!existing) return { list: sortIncidents([inc, ...list]), event: { type: 'created', incident: inc } };
    // Already known. The full row replaces a copy of it, with no second alert.
    if (change.from === 'reports' && existing.limited) return { list: list.map((i) => (i.id === inc.id ? inc : i)) };
    return { list };
  }

  return {
    list: existing ? list.map((i) => (i.id === inc.id ? inc : i)) : sortIncidents([inc, ...list]),
    event: { type: 'updated', incident: inc, previous: existing },
  };
}
