/** Downtown Memphis geography helpers (geocoding via OpenStreetMap Nominatim). */

export const DOWNTOWN_CENTER: [number, number] = [35.1446, -90.0509];

/**
 * Approximate outline of the downtown core, river to Danny Thomas Blvd and
 * Crump Blvd to A.W. Willis Ave. Context only — not a legal boundary.
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

export interface Place {
  lat: number;
  lng: number;
  address?: string;
}

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(miles: number): string {
  if (!Number.isFinite(miles)) return '';
  const feet = miles * 5280;
  if (feet < 1000) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';
// Bias forward geocoding to the downtown area.
const VIEWBOX = '-90.075,35.170,-90.025,35.115';

export async function geocode(query: string): Promise<Place | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `${NOMINATIM}/search?format=json&limit=1&viewbox=${VIEWBOX}&bounded=0&q=${encodeURIComponent(
        /memphis/i.test(q) ? q : `${q}, Memphis, TN`,
      )}`,
      { headers: { Accept: 'application/json' } },
    );
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (data?.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name };
    }
  } catch {
    /* offline or rate-limited */
  }
  return null;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`,
      { headers: { Accept: 'application/json' } },
    );
    const data = (await res.json()) as { display_name?: string };
    return data?.display_name;
  } catch {
    return undefined;
  }
}

export function currentPosition(timeoutMs = 10_000): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Location permission was denied' : 'Could not get your location')),
      { enableHighAccuracy: true, timeout: timeoutMs },
    );
  });
}

/** Simple jitter so overlapping pins at one address stay clickable. */
export function jitter(lat: number, lng: number, seed: string, meters = 12): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const d = meters / 111_320;
  return [lat + Math.sin(angle) * d, lng + (Math.cos(angle) * d) / Math.cos((lat * Math.PI) / 180)];
}
