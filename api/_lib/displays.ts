import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Wall displays: a TV on an office wall opens /tv#key=<key>. The key is 32 random bytes (base64url) shown once
 * inside the link; only its SHA-256 hash is stored (public.display_links, server-only). The feed below is the
 * whole of what a display ever receives: no reporter, contact details, descriptions, subjects, photos or notes.
 */

export const DISPLAY_KEY = /^[A-Za-z0-9_-]{43}$/;
/** How far back the wall looks for closed reports; open ones show however old they are. */
export const FEED_HOURS = 24;
const OPEN = ['active', 'acknowledged', 'responding'];

export function newDisplayKey(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDisplayKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** The display's key from the request: `X-Display-Key: <key>`. */
export function displayKeyFrom(headers: Record<string, string | string[] | undefined>): string | null {
  const raw = headers['x-display-key'];
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  return DISPLAY_KEY.test(key) ? key : null;
}

export interface DisplayLink {
  id: string;
  label: string;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

/** The live (not revoked) display link for a key, or null. */
export async function findDisplay(admin: SupabaseClient, key: string): Promise<DisplayLink | null> {
  const { data, error } = await admin
    .from('display_links')
    .select('id, label, created_at, last_seen_at, revoked_at')
    .eq('token_hash', hashDisplayKey(key))
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as DisplayLink | null) ?? null;
}

/** Note that a display is alive — at most every two minutes, so a wall polling every 15 s costs few writes. */
export async function touchDisplay(admin: SupabaseClient, d: DisplayLink): Promise<void> {
  const last = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
  if (Date.now() - last < 120_000) return;
  await admin.from('display_links').update({ last_seen_at: new Date().toISOString() }).eq('id', d.id);
}

export function displayRef(id: string): string {
  const hex = id.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return `DT-${(hex.slice(0, 4) || '0000').padEnd(4, '0')}`;
}

/** "115 S Main St, Memphis, TN 38103" → "115 S Main St" (as the dashboard's own shortAddress). */
export function shortAddress(address: string | null | undefined): string {
  if (!address) return '';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const drop = /^(memphis|shelby county|tennessee|tn|united states|usa|\d{5}(-\d{4})?|(tn|tennessee)\s+\d{5}(-\d{4})?)$/i;
  return parts.filter((p) => !drop.test(p)).slice(0, 2).join(', ') || parts[0] || address;
}

export interface WallReport {
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

export interface WallFeed {
  generatedAt: string;
  hours: number;
  counts: { new: number; open: number; urgent: number; last24h: number; lookouts: number };
  reports: WallReport[];
}

interface Row {
  id: string;
  incident_type: string | null;
  priority: number | null;
  status: string;
  title: string | null;
  description: string | null;
  address: string | null;
  location_note: string | null;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string | null;
  happening_now: boolean | null;
  weapons_seen: boolean | null;
  injuries: boolean | null;
  visibility: string | null;
}

function headline(r: Row): string {
  const t = r.title?.trim();
  if (t) return t.length > 90 ? `${t.slice(0, 87).trimEnd()}…` : t;
  // Older rows have no title: the first sentence of the description stands in (the dashboard does the same).
  const first = (r.description ?? '').split(/[.!?]\s|\n/)[0]?.trim() ?? '';
  if (!first) return r.incident_type || 'Report';
  return first.length > 72 ? `${first.slice(0, 69).trimEnd()}…` : first.replace(/[.]$/, '');
}

/** Everything a wall display shows: open reports of any age, closed ones from the last FEED_HOURS. */
export async function wallFeed(admin: SupabaseClient, now = Date.now()): Promise<WallFeed> {
  const since = new Date(now - FEED_HOURS * 3_600_000).toISOString();
  const cols =
    'id, incident_type, priority, status, title, description, address, location_note, lat, lng, created_at, updated_at, happening_now, weapons_seen, injuries, visibility';
  const [recent, open, bolos] = await Promise.all([
    admin.from('reports').select(cols).neq('status', 'dismissed').gte('created_at', since).order('created_at', { ascending: false }).limit(150),
    admin.from('reports').select(cols).in('status', OPEN).lt('created_at', since).order('created_at', { ascending: false }).limit(50),
    admin.from('bolos').select('id', { count: 'exact', head: true }).eq('status', 'active').gt('expires_at', new Date(now).toISOString()),
  ]);
  if (recent.error) throw new Error(recent.error.message);
  if (open.error) throw new Error(open.error.message);
  const rows = [...((recent.data ?? []) as Row[]), ...((open.data ?? []) as Row[])];
  const reports: WallReport[] = rows.map((r) => ({
    ref: displayRef(r.id),
    category: r.incident_type || 'Other',
    priority: Math.min(4, Math.max(1, Number(r.priority) || 3)),
    status: r.status,
    title: headline(r),
    place: shortAddress(r.address) || (r.location_note ?? '').slice(0, 60),
    lat: Number(r.lat),
    lng: Number(r.lng),
    reportedAt: r.created_at,
    updatedAt: r.updated_at ?? r.created_at,
    happeningNow: Boolean(r.happening_now),
    weaponSeen: Boolean(r.weapons_seen),
    someoneHurt: Boolean(r.injuries),
    officersOnly: r.visibility === 'officers',
  }));
  const isOpen = (r: WallReport) => OPEN.includes(r.status);
  return {
    generatedAt: new Date(now).toISOString(),
    hours: FEED_HOURS,
    counts: {
      new: reports.filter((r) => r.status === 'active').length,
      open: reports.filter(isOpen).length,
      urgent: reports.filter((r) => isOpen(r) && r.priority <= 2).length,
      last24h: reports.filter((r) => now - new Date(r.reportedAt).getTime() <= FEED_HOURS * 3_600_000).length,
      lookouts: bolos.count ?? 0,
    },
    reports,
  };
}
