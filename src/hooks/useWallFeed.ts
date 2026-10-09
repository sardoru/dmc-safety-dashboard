import { useEffect, useMemo, useState } from 'react';
import { supabaseConfigured } from '../lib/supabase';
import { useIncidents } from '../context/IncidentContext';
import { useBolos } from '../context/BoloContext';
import { categoryFromLabel, STATUSES } from '../lib/taxonomy';
import { shortAddress } from '../lib/format';
import type { CategoryKey, IncidentStatus, Priority } from '../types';

/** A report as a wall display shows it (api/_lib/displays.ts): no reporter, contact details, descriptions or photos. */
export interface WallItem {
  ref: string;
  category: CategoryKey;
  priority: Priority;
  status: IncidentStatus;
  title: string;
  place: string;
  lat: number;
  lng: number;
  reportedAt: number;
  updatedAt: number;
  happeningNow: boolean;
  weaponSeen: boolean;
  someoneHurt: boolean;
  officersOnly: boolean;
}

export interface WallCounts {
  new: number;
  open: number;
  urgent: number;
  last24h: number;
  lookouts: number;
}

export type WallState =
  | { kind: 'no-key' }
  | { kind: 'loading' }
  | { kind: 'revoked'; message: string }
  | { kind: 'ready'; label: string; items: WallItem[]; counts: WallCounts; fetchedAt: number; stale: boolean; demo: boolean };

export const WALL_REFRESH_MS = 15_000;
const HOURS = 24;

/** The display key from the URL: /tv#key=… (kept out of server logs), or /tv?key=… */
export function displayKeyFromLocation(loc: Pick<Location, 'hash' | 'search'>): string | null {
  const fromHash = new URLSearchParams(loc.hash.replace(/^#/, '')).get('key');
  const key = (fromHash ?? new URLSearchParams(loc.search).get('key') ?? '').trim();
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null;
}

interface ApiReport {
  ref: string;
  category: string;
  priority: number;
  status: string;
  title: string;
  place: string;
  lat: number;
  lng: number;
  reportedAt: string;
  updatedAt: string;
  happeningNow: boolean;
  weaponSeen: boolean;
  someoneHurt: boolean;
  officersOnly: boolean;
}

function fromApi(r: ApiReport): WallItem {
  return {
    ref: r.ref,
    category: categoryFromLabel(r.category),
    priority: (r.priority >= 1 && r.priority <= 4 ? r.priority : 3) as Priority,
    status: r.status in STATUSES ? (r.status as IncidentStatus) : 'active',
    title: r.title,
    place: r.place,
    lat: r.lat,
    lng: r.lng,
    reportedAt: new Date(r.reportedAt).getTime(),
    updatedAt: new Date(r.updatedAt).getTime(),
    happeningNow: r.happeningNow,
    weaponSeen: r.weaponSeen,
    someoneHurt: r.someoneHurt,
    officersOnly: r.officersOnly,
  };
}

/**
 * The wall display's feed: GET /api/display with the link's key, every 15 s and whenever the screen wakes.
 * A failed poll keeps the last picture on screen (marked stale); a revoked key stops the screen. In demo mode
 * (no backend) the feed is built from the sample data, so the page can be seen without a link.
 */
export function useWallFeed(key: string | null): WallState {
  const isDemo = !supabaseConfigured;
  const { incidents } = useIncidents();
  const { bolos } = useBolos();
  const [state, setState] = useState<WallState>(() => (isDemo ? { kind: 'loading' } : key ? { kind: 'loading' } : { kind: 'no-key' }));

  useEffect(() => {
    if (isDemo || !key) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/display', { headers: { 'X-Display-Key': key }, cache: 'no-store' });
        if (!active) return;
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setState({ kind: 'revoked', message: body.error || 'This display link was revoked.' });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { display: { label: string }; counts: WallCounts; reports: ApiReport[] };
        setState({
          kind: 'ready',
          label: body.display.label,
          items: body.reports.map(fromApi),
          counts: body.counts,
          fetchedAt: Date.now(),
          stale: false,
          demo: false,
        });
      } catch {
        if (!active) return;
        // Keep the last picture up; the header shows it is reconnecting.
        setState((s) => (s.kind === 'ready' ? { ...s, stale: true } : s));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), WALL_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [isDemo, key]);

  // Demo: the sample reports, shaped exactly like the live feed.
  const demo = useMemo<WallState | null>(() => {
    if (!isDemo) return null;
    const now = Date.now();
    const open = (s: IncidentStatus) => STATUSES[s].open;
    const items: WallItem[] = incidents
      .filter((i) => i.status !== 'dismissed' && (open(i.status) || now - i.createdAt <= HOURS * 3_600_000))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => ({
        ref: i.ref,
        category: i.category,
        priority: i.priority,
        status: i.status,
        title: i.title,
        place: shortAddress(i.address) || i.locationNote || '',
        lat: i.lat,
        lng: i.lng,
        reportedAt: i.createdAt,
        updatedAt: i.updatedAt,
        happeningNow: i.happeningNow,
        weaponSeen: i.weaponsSeen,
        someoneHurt: i.injuries,
        officersOnly: i.visibility === 'officers',
      }));
    return {
      kind: 'ready',
      label: 'Sample data',
      items,
      counts: {
        new: items.filter((i) => i.status === 'active').length,
        open: items.filter((i) => open(i.status)).length,
        urgent: items.filter((i) => open(i.status) && i.priority <= 2).length,
        last24h: items.filter((i) => now - i.reportedAt <= HOURS * 3_600_000).length,
        lookouts: bolos.filter((b) => b.status === 'active').length,
      },
      fetchedAt: now,
      stale: false,
      demo: true,
    };
  }, [isDemo, incidents, bolos]);

  return demo ?? state;
}
