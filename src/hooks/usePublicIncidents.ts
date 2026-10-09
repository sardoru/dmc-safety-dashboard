import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useIncidents } from '../context/IncidentContext';
import { categoryFromLabel, STATUSES } from '../lib/taxonomy';
import type { CategoryKey, IncidentStatus, Priority } from '../types';

/** A report as the public sees it: no text, people, photos or exact address. */
export interface PublicIncident {
  ref: string;
  category: CategoryKey;
  priority: Priority;
  status: IncidentStatus;
  /** Rounded to 3 decimals (~100 m) by the database. */
  lat: number;
  lng: number;
  reportedAt: number;
  updatedAt: number;
}

interface Row {
  ref: string;
  category: string | null;
  priority: number | null;
  status: string | null;
  lat: number;
  lng: number;
  reported_at: string;
  updated_at: string | null;
}

const REFRESH_MS = 60_000;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function fromRow(r: Row): PublicIncident {
  const reportedAt = new Date(r.reported_at).getTime();
  return {
    ref: r.ref,
    category: categoryFromLabel(r.category),
    priority: (r.priority && r.priority >= 1 && r.priority <= 4 ? r.priority : 4) as Priority,
    status: r.status && r.status in STATUSES ? (r.status as IncidentStatus) : 'active',
    lat: r.lat,
    lng: r.lng,
    reportedAt,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : reportedAt,
  };
}

interface FeedState {
  /** The window (hours) the items belong to; -1 before the first answer. */
  hours: number;
  items: PublicIncident[];
  fetchedAt: number;
  error: string;
}

/**
 * The public map feed: `public_incidents()` (community reports only, sanitized
 * in the database), polled every minute and whenever the tab comes back.
 */
export function usePublicIncidents(hours: number, isDemo: boolean, now: number) {
  const { incidents } = useIncidents();
  const [feed, setFeed] = useState<FeedState>({ hours: -1, items: [], fetchedAt: 0, error: '' });

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    const load = () => {
      void supabase.rpc('public_incidents', { p_hours: hours }).then(({ data, error }) => {
        if (!active) return;
        if (error) setFeed((f) => ({ ...f, hours, error: 'The live feed is unavailable right now. It will retry in a minute.' }));
        else setFeed({ hours, items: ((data ?? []) as Row[]).map(fromRow), fetchedAt: Date.now(), error: '' });
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [hours, isDemo]);

  // Demo: the sample reports, reduced to what the public feed would show.
  const demoItems = useMemo(
    () =>
      isDemo
        ? incidents
            .filter((i) => i.visibility === 'community' && i.status !== 'dismissed' && now - i.createdAt < hours * 3_600_000)
            .map<PublicIncident>((i) => ({
              ref: i.id.slice(-10),
              category: i.category,
              priority: i.priority,
              status: i.status,
              lat: round3(i.lat),
              lng: round3(i.lng),
              reportedAt: i.createdAt,
              updatedAt: i.updatedAt,
            }))
            .sort((a, b) => b.reportedAt - a.reportedAt)
        : [],
    [isDemo, incidents, hours, now],
  );

  if (isDemo) return { items: demoItems, loading: false, error: '', fetchedAt: now };
  return { items: feed.items, loading: feed.hours !== hours, error: feed.error, fetchedAt: feed.fetchedAt };
}
