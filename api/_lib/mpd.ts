/**
 * The Memphis Police Department's own reports, from the City of Memphis open data: the "MPD Public Safety
 * Incidents" dataset (Memphis Open Data Hub, 12b51ce4d5a14493ab6cc05d32e0c1ee_0), limited to the downtown core and
 * to reports from the last 7 days.
 *
 * The dataset's page says "No License Provided — Request permission to use", so on 2026-10-10 the owner wrote to the
 * City's Open Data Program and to MPD for written permission. Until it arrives /api/mpd-incidents stays off
 * (MPD_LAYER must be "on").
 */

export const MPD_DATASET_URL = 'https://data.memphistn.gov/datasets/12b51ce4d5a14493ab6cc05d32e0c1ee_0';
export const MPD_QUERY_URL =
  'https://services2.arcgis.com/saWmpKJIUAjyyNVc/arcgis/rest/services/MPD_Public_Safety_Incidents/FeatureServer/0/query';
/** The citation the City's Open Data Policy suggests (2018): name, then "accessed <date>, data.memphistn.gov". */
export const MPD_CITATION = 'City of Memphis, Open Data Program, MPD Public Safety Incidents';
export const MPD_WINDOW_DAYS = 7;

/**
 * The downtown core outline, [lat, lng]: the same points as DOWNTOWN_CORE in src/lib/geo.ts, which the maps draw
 * (the API harness checks the two match). River to Danny Thomas Blvd, Crump Blvd to A.W. Willis Ave.
 */
export const DOWNTOWN_CORE: [number, number][] = [
  [35.1612, -90.0545],
  [35.1622, -90.0446],
  [35.1588, -90.0398],
  [35.1381, -90.0396],
  [35.1262, -90.0436],
  [35.1263, -90.0596],
  [35.1371, -90.0618],
  [35.1503, -90.0604],
];

/** Only the fields the dashboard shows (plus Crime_ID, to group the offense lines of one incident). */
const FIELDS = [
  'Crime_ID',
  'Offense_Datetime',
  'Reported_Datetime',
  'UCR_Category',
  'UCR_Description',
  'Part_One_or_Part_Two',
  'Block',
  'Street_Name',
  'Street_Address',
  'Latitude',
  'Longitude',
];

/** One row of the dataset: one offense line (an incident can have several). Dates are epoch ms, UTC. */
export interface MpdRow {
  Crime_ID?: string | null;
  Offense_Datetime?: number | null;
  Reported_Datetime?: number | null;
  UCR_Category?: string | null;
  UCR_Description?: string | null;
  Part_One_or_Part_Two?: number | null;
  Block?: number | null;
  Street_Name?: string | null;
  Street_Address?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
}

/** One incident, as the dashboard shows it. */
export interface MpdIncident {
  id: string;
  reportedAt: number;
  occurredAt: number | null;
  /** UCR category, as published (upper case). */
  category: string;
  /** Every UCR offense description on the report, as published. */
  offenses: string[];
  part: 1 | 2 | null;
  /** Block-level: "200 block of Peabody Pl", or an intersection, "Riverside Dr & Jefferson Ave". */
  address: string;
  /** As published: the City rounds locations to about 100 m. */
  lat: number;
  lng: number;
}

/** An ArcGIS SQL timestamp literal. The layer keeps its dates in UTC (dateFieldsTimeReference). */
function sqlTimestamp(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/** The query: reports since `since`, points inside the downtown core, newest first, one page of up to 1,000. */
export function mpdQuery(since: number, offset = 0): URLSearchParams {
  const ring = [...DOWNTOWN_CORE, DOWNTOWN_CORE[0]].map(([lat, lng]) => [lng, lat]);
  return new URLSearchParams({
    where: `Reported_Datetime >= TIMESTAMP '${sqlTimestamp(since)}'`,
    geometry: JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }),
    geometryType: 'esriGeometryPolygon',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: FIELDS.join(','),
    returnGeometry: 'false',
    orderByFields: 'Reported_Datetime DESC',
    resultOffset: String(offset),
    resultRecordCount: '1000',
    f: 'json',
  });
}

/** Is [lat, lng] inside the downtown core? (Ray casting; a second check on the City's own spatial filter.) */
export function insideCore(lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = DOWNTOWN_CORE.length - 1; i < DOWNTOWN_CORE.length; j = i++) {
    const [yi, xi] = DOWNTOWN_CORE[i];
    const [yj, xj] = DOWNTOWN_CORE[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
const titleCase = (s: string): string => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "200 block of Peabody Pl", "Riverside Dr & Jefferson Ave" (the City writes intersections "A//B"), or the street. */
export function mpdAddress(r: Pick<MpdRow, 'Block' | 'Street_Name' | 'Street_Address'>): string {
  const street = clean(r.Street_Name) || clean(r.Street_Address);
  if (street.includes('//')) {
    return street
      .split('//')
      .map((s) => titleCase(clean(s)))
      .filter(Boolean)
      .join(' & ');
  }
  const block = Number(r.Block);
  return block > 0 ? `${block} block of ${titleCase(street)}` : titleCase(street);
}

/**
 * One incident per Crime ID: a report can carry several offense lines at one place (drugs and a weapon, say).
 * Drops rows without a place or a report time, rows reported before `since`, and points outside the downtown core.
 * The category is the first line's, unless a later line is a Part One offense. Newest report first.
 */
export function groupMpdRows(rows: MpdRow[], since: number): MpdIncident[] {
  const byId = new Map<string, MpdIncident>();
  for (const r of rows) {
    const lat = Number(r.Latitude);
    const lng = Number(r.Longitude);
    const reportedAt = Number(r.Reported_Datetime);
    if (!r.Latitude || !r.Longitude || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!r.Reported_Datetime || !Number.isFinite(reportedAt) || reportedAt < since) continue;
    if (!insideCore(lat, lng)) continue;
    const offense = clean(r.UCR_Description);
    const part = r.Part_One_or_Part_Two === 1 ? 1 : r.Part_One_or_Part_Two === 2 ? 2 : null;
    const id = clean(r.Crime_ID) || `${reportedAt}:${lat}:${lng}`;
    const seen = byId.get(id);
    if (seen) {
      if (offense && !seen.offenses.includes(offense)) seen.offenses.push(offense);
      if (part === 1 && seen.part !== 1) {
        seen.part = 1;
        seen.category = clean(r.UCR_Category) || seen.category;
      }
      continue;
    }
    const occurredAt = Number(r.Offense_Datetime);
    byId.set(id, {
      id,
      reportedAt,
      occurredAt: r.Offense_Datetime && Number.isFinite(occurredAt) ? occurredAt : null,
      category: clean(r.UCR_Category),
      offenses: offense ? [offense] : [],
      part,
      address: mpdAddress(r),
      lat,
      lng,
    });
  }
  return [...byId.values()].sort((a, b) => b.reportedAt - a.reportedAt);
}
