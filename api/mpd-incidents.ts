import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchWithTimeout, methodNotAllowed, sendJson } from './_lib/http.js';
import {
  MPD_CITATION,
  MPD_DATASET_URL,
  MPD_QUERY_URL,
  MPD_WINDOW_DAYS,
  groupMpdRows,
  mpdQuery,
  type MpdRow,
} from './_lib/mpd.js';

/**
 * GET /api/mpd-incidents — the Memphis Police Department's own reports from the City of Memphis open data, inside
 * the downtown core and reported in the last 7 days (see _lib/mpd.ts).
 *
 * Public, like the City's dataset. Cached at the edge for 30 minutes, so the City's service is read at most about
 * once every 30 minutes. Off ({ enabled: false }) unless MPD_LAYER=on: the owner asked the City and MPD for written
 * permission first.
 */
/** One page from the City's service. A dropped connection or a 5xx gets one more try. */
async function queryPage(since: number, offset: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetchWithTimeout(
        MPD_QUERY_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': '901safety.com (Core Downtown Memphis Safety Dashboard)' },
          body: mpdQuery(since, offset).toString(),
        },
        10_000,
      );
      if (r.status >= 500 && attempt < 2) continue;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { features?: { attributes: MpdRow }[]; exceededTransferLimit?: boolean; error?: { message?: string } };
      if (data.error) throw new Error(data.error.message ?? 'query failed');
      return data;
    } catch (e) {
      if (attempt < 2 && e instanceof TypeError) continue; // fetch() itself failed: the connection dropped
      throw e;
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['GET'])) return;
  if (process.env.MPD_LAYER !== 'on') {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    sendJson(res, 200, { enabled: false });
    return;
  }

  const now = Date.now();
  // On the hour, so every request within the hour asks the City the same question.
  const since = Math.floor((now - MPD_WINDOW_DAYS * 86_400_000) / 3_600_000) * 3_600_000;
  try {
    const rows: MpdRow[] = [];
    // About 60 reports a week fit one page; follow the City's paging anyway, up to 5,000 rows.
    for (let offset = 0; offset < 5000; offset += 1000) {
      const data = await queryPage(since, offset);
      rows.push(...(data.features ?? []).map((f) => f.attributes));
      if (!data.exceededTransferLimit) break;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=1800');
    sendJson(res, 200, {
      enabled: true,
      accessedAt: new Date(now).toISOString(),
      since: new Date(since).toISOString(),
      windowDays: MPD_WINDOW_DAYS,
      source: { name: 'Memphis Police Department', citation: MPD_CITATION, url: MPD_DATASET_URL },
      incidents: groupMpdRows(rows, since),
    });
  } catch (e) {
    console.error('mpd-incidents', e instanceof Error ? e.message : e);
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    sendJson(res, 502, { enabled: true, error: 'The City’s open data did not answer. Try again in a few minutes.' });
  }
}
