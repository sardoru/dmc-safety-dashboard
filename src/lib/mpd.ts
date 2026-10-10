/**
 * The Memphis Police Department's own reports, from the City of Memphis open data (/api/mpd-incidents): the
 * downtown core, reported in the last 7 days. Shown on the maps as their own layer, apart from the community's
 * reports, with the City's citation. The API answers { enabled: false } until the owner turns it on (MPD_LAYER=on),
 * once the City and MPD give permission.
 */

export interface MpdIncident {
  id: string;
  reportedAt: number;
  occurredAt: number | null;
  /** UCR category, as published (upper case). */
  category: string;
  /** Every UCR offense description on the report, as published. */
  offenses: string[];
  part: 1 | 2 | null;
  /** Block-level: "200 block of Peabody Pl", or an intersection. */
  address: string;
  lat: number;
  lng: number;
}

export interface MpdFeed {
  enabled: boolean;
  accessedAt?: string;
  windowDays?: number;
  source?: { name: string; citation: string; url: string };
  incidents?: MpdIncident[];
  error?: string;
}

/** The City's UCR wording in sentence case: "LARCENY/THEFT" → "Larceny/theft". The words stay the City's. */
export function ucrLabel(s: string): string {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "City of Memphis, Open Data Program, MPD Public Safety Incidents, accessed Oct 10, 2026, data.memphistn.gov" */
export function mpdCitation(feed: MpdFeed): string {
  const when = feed.accessedAt
    ? new Date(feed.accessedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
    : '';
  return `${feed.source?.citation ?? 'City of Memphis, Open Data Program, MPD Public Safety Incidents'}${when ? `, accessed ${when}` : ''}, data.memphistn.gov`;
}

/** The note that goes with the data wherever it is shown. */
export const MPD_NOTE = 'Preliminary reports from the City’s open data. They can change as cases are reviewed, and they are not the official crime index.';
