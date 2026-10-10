import { useEffect, useState } from 'react';
import type { MpdFeed } from '../lib/mpd';

const REFRESH_MS = 30 * 60_000; // the API caches for 30 minutes too

/**
 * The MPD's reports from the City's open data, for a map that shows them. `{ enabled: false }` until the layer is
 * turned on (or when the API can't be reached, e.g. a local dev server without /api): the map then shows nothing
 * of it, not even the layer toggle. A failed refresh keeps the last good reports.
 */
export function useMpdIncidents(wanted = true): MpdFeed {
  const [feed, setFeed] = useState<MpdFeed>({ enabled: false });

  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/mpd-incidents', { headers: { Accept: 'application/json' } });
        const data = (await res.json()) as MpdFeed;
        if (!alive) return;
        if (res.ok) setFeed(data);
        else if (!data.enabled) setFeed({ enabled: false });
      } catch {
        // Not reachable: keep what we have.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [wanted]);

  return feed;
}
