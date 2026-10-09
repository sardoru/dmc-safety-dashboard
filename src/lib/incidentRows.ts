import type {
  Bolo,
  Incident,
  IncidentStatus,
  IncidentUpdate,
  NewIncidentInput,
  ReportKind,
  SubjectDescription,
  VehicleDescription,
} from '../types';
import { categoryFromLabel, categoryMeta, toPriority } from './taxonomy';
import { generateId, incidentRef } from './format';

/** A `reports` row — v2 columns are optional so legacy rows parse too. */
export interface ReportRow {
  id: string;
  reporter_id: string | null;
  source: 'officer' | 'business';
  kind: string;
  incident_type: string;
  description: string;
  transcript: string | null;
  business_id: string | null;
  business_name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  status: string;
  acknowledged_by: string[] | null;
  created_at: string;
  title?: string | null;
  priority?: number | null;
  occurred_at?: string | null;
  happening_now?: boolean | null;
  weapons_seen?: boolean | null;
  injuries?: boolean | null;
  subjects?: unknown;
  vehicles?: unknown;
  photos?: string[] | null;
  location_note?: string | null;
  assigned_to?: string | null;
  assigned_name?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  visibility?: string | null;
  contact_ok?: boolean | null;
  contact_phone?: string | null;
  bolo_id?: string | null;
  ai_summary?: string | null;
}

const STATUSES: IncidentStatus[] = ['active', 'acknowledged', 'responding', 'resolved', 'dismissed'];

function ts(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : undefined;
}

function asSubjects(value: unknown): SubjectDescription[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    .map((v) => ({ ...(v as object), id: typeof v.id === 'string' ? v.id : generateId() }) as SubjectDescription);
}

function asVehicles(value: unknown): VehicleDescription[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === 'object')
    .map((v) => ({ ...(v as object), id: typeof v.id === 'string' ? v.id : generateId() }) as VehicleDescription);
}

/** First sentence-ish of a description, for rows saved before titles existed. */
export function deriveTitle(description: string, fallback: string): string {
  // No regex lookbehind here: older iOS Safari can't parse it.
  const first = description.split(/[.!?]\s|\n/)[0]?.trim() ?? '';
  if (!first) return fallback;
  return first.length > 72 ? `${first.slice(0, 69).trimEnd()}…` : first.replace(/[.]$/, '');
}

export function rowToIncident(r: ReportRow): Incident {
  const category = categoryFromLabel(r.incident_type);
  const createdAt = ts(r.created_at) ?? Date.now();
  const status = (STATUSES as string[]).includes(r.status) ? (r.status as IncidentStatus) : 'active';
  const defaultName = r.source === 'officer' ? 'Public Safety' : 'Downtown business';
  return {
    id: r.id,
    ref: incidentRef(r.id),
    source: r.source,
    kind: (['voice', 'quick', 'incident', 'form'].includes(r.kind) ? r.kind : 'incident') as ReportKind,
    category,
    categoryLabel: r.incident_type || categoryMeta(category).label,
    priority: toPriority(r.priority, categoryMeta(category).defaultPriority),
    status,
    title: r.title?.trim() || deriveTitle(r.description ?? '', r.incident_type || 'Report'),
    description: r.description ?? '',
    transcript: r.transcript ?? undefined,
    reporterId: r.reporter_id ?? undefined,
    reporterName: r.business_name || defaultName,
    businessId: r.business_id ?? undefined,
    address: r.address ?? '',
    locationNote: r.location_note ?? undefined,
    lat: r.lat,
    lng: r.lng,
    createdAt,
    occurredAt: ts(r.occurred_at) ?? createdAt,
    updatedAt: ts(r.updated_at) ?? createdAt,
    happeningNow: Boolean(r.happening_now),
    weaponsSeen: Boolean(r.weapons_seen),
    injuries: Boolean(r.injuries),
    subjects: asSubjects(r.subjects),
    vehicles: asVehicles(r.vehicles),
    photos: Array.isArray(r.photos) ? r.photos : [],
    assignedTo: r.assigned_to ?? undefined,
    assignedName: r.assigned_name ?? undefined,
    acknowledgedAt: ts(r.acknowledged_at),
    resolvedAt: ts(r.resolved_at),
    seenBy: r.acknowledged_by ?? [],
    visibility: r.visibility === 'officers' ? 'officers' : 'community',
    contactOk: r.contact_ok ?? true,
    contactPhone: r.contact_phone ?? undefined,
    boloId: r.bolo_id ?? undefined,
    aiSummary: r.ai_summary ?? undefined,
  };
}

// ── Other members' reports ───────────────────────────────────────────────────

/**
 * A `community_reports` row (migration 0007): someone else's community report as member businesses get it. The
 * reporter, contact details, transcript, photos and internal fields are not in the table, so they can't reach a
 * member's browser; `business_name` is set only for a storefront.
 */
export interface CommunityReportRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  occurred_at: string | null;
  source: 'officer' | 'business';
  kind: string;
  incident_type: string;
  priority: number | null;
  status: string;
  title: string | null;
  description: string | null;
  address: string | null;
  location_note: string | null;
  lat: number;
  lng: number;
  happening_now: boolean | null;
  weapons_seen: boolean | null;
  injuries: boolean | null;
  visibility: string | null;
  subjects: unknown;
  vehicles: unknown;
  business_name: string | null;
  assigned_name: string | null;
  photo_count: number | null;
  seen_count: number | null;
}

/** What members read from `community_reports`, in table order (the API harness checks it against migration 0007). */
export const COMMUNITY_REPORT_COLUMNS = [
  'id',
  'created_at',
  'updated_at',
  'occurred_at',
  'source',
  'kind',
  'incident_type',
  'priority',
  'status',
  'title',
  'description',
  'address',
  'location_note',
  'lat',
  'lng',
  'happening_now',
  'weapons_seen',
  'injuries',
  'visibility',
  'subjects',
  'vehicles',
  'business_name',
  'assigned_name',
  'photo_count',
  'seen_count',
] as const satisfies readonly (keyof CommunityReportRow)[];

/**
 * A community copy as an incident (`limited`). `seenBy` holds `viewerId` when the viewer marked it as seen —
 * never anyone else; `seenCount` and `photoCount` carry the totals.
 */
export function communityRowToIncident(r: CommunityReportRow, seenByViewer: string | null): Incident {
  const inc = rowToIncident({
    id: r.id,
    reporter_id: null,
    source: r.source === 'officer' ? 'officer' : 'business',
    kind: r.kind,
    incident_type: r.incident_type,
    description: r.description ?? '',
    transcript: null,
    business_id: null,
    business_name: r.business_name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    status: r.status,
    acknowledged_by: seenByViewer ? [seenByViewer] : [],
    created_at: r.created_at,
    title: r.title,
    priority: r.priority,
    occurred_at: r.occurred_at,
    happening_now: r.happening_now,
    weapons_seen: r.weapons_seen,
    injuries: r.injuries,
    subjects: r.subjects,
    vehicles: r.vehicles,
    location_note: r.location_note,
    assigned_name: r.assigned_name,
    updated_at: r.updated_at,
    visibility: 'community',
  });
  return {
    ...inc,
    limited: true,
    photoCount: Math.max(0, Number(r.photo_count) || 0),
    seenCount: Math.max(Number(r.seen_count) || 0, inc.seenBy.length),
  };
}

// ── Writing ──────────────────────────────────────────────────────────────────

export function describeSubject(s: SubjectDescription): string {
  const clothing = [s.clothingTop, s.clothingBottom, s.footwear].filter(Boolean).join(', ');
  return [
    [s.sex, s.ageRange].filter(Boolean).join(', '),
    [s.height, s.build].filter(Boolean).join(', '),
    s.hair,
    clothing,
    s.distinguishing,
    s.behavior && `behavior: ${s.behavior}`,
    s.direction && `went ${s.direction}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export function describeVehicle(v: VehicleDescription): string {
  const name = [v.color, v.make, v.model, v.bodyType].filter(Boolean).join(' ');
  return [
    name,
    v.plate && `plate ${v.plate}${v.plateState ? ` (${v.plateState})` : ''}`,
    v.notes,
    v.direction && `went ${v.direction}`,
  ]
    .filter(Boolean)
    .join('; ');
}

/** One-line description of a person for compact places (BOLO cards, map popups). */
export function subjectLine(s?: SubjectDescription): string {
  if (!s) return '';
  return [s.sex, s.ageRange, s.height, s.build, s.clothingTop, s.clothingBottom, s.distinguishing].filter(Boolean).join(' · ');
}

export function vehicleLine(v?: VehicleDescription): string {
  if (!v) return '';
  return [[v.color, v.make, v.model].filter(Boolean).join(' '), v.bodyType, v.plate && `plate ${v.plate}`, v.notes]
    .filter(Boolean)
    .join(' · ');
}

/** Fold the structured details into the description for databases still on the old schema. */
export function legacyDescription(input: NewIncidentInput): string {
  const parts = [input.title && input.title !== input.description ? `${input.title}.` : '', input.description];
  const flags = [
    input.happeningNow && 'HAPPENING NOW',
    input.weaponsSeen && 'weapon seen',
    input.injuries && 'injuries',
  ].filter(Boolean);
  if (flags.length) parts.push(`[${flags.join(' · ')}]`);
  input.subjects?.forEach((s, i) => parts.push(`Person ${i + 1}: ${describeSubject(s)}.`));
  input.vehicles?.forEach((v, i) => parts.push(`Vehicle ${i + 1}: ${describeVehicle(v)}.`));
  if (input.locationNote) parts.push(`Location note: ${input.locationNote}.`);
  return parts.filter(Boolean).join(' ').trim();
}

export function newIncidentRow(
  input: NewIncidentInput,
  reporterId: string | null,
  photos: string[],
  v2: boolean,
): Record<string, unknown> {
  const base = {
    reporter_id: reporterId,
    source: input.source,
    incident_type: categoryMeta(input.category).label,
    transcript: input.transcript ?? null,
    business_id: input.businessId ?? null,
    business_name: input.reporterName,
    address: input.address || null,
    lat: input.lat,
    lng: input.lng,
  };
  if (!v2) {
    return {
      ...base,
      kind: input.kind === 'form' ? 'incident' : input.kind,
      description: legacyDescription(input),
    };
  }
  const strip = <T extends { id: string }>(items: T[] | undefined) => (items ?? []).map((it) => ({ ...it }));
  return {
    ...base,
    kind: input.kind,
    description: input.description,
    title: input.title,
    priority: input.priority,
    occurred_at: new Date(input.occurredAt ?? Date.now()).toISOString(),
    happening_now: Boolean(input.happeningNow),
    weapons_seen: Boolean(input.weaponsSeen),
    injuries: Boolean(input.injuries),
    subjects: strip(input.subjects),
    vehicles: strip(input.vehicles),
    photos,
    location_note: input.locationNote || null,
    visibility: input.visibility ?? 'community',
    contact_ok: input.contactOk ?? true,
    contact_phone: input.contactPhone || null,
    bolo_id: input.boloId ?? null,
    ai_summary: input.aiSummary ?? null,
  };
}

/** Old schema only knows active / acknowledged / resolved. */
export function legacyStatus(status: IncidentStatus): IncidentStatus {
  if (status === 'responding') return 'acknowledged';
  if (status === 'dismissed') return 'resolved';
  return status;
}

// ── Timeline + BOLO rows ─────────────────────────────────────────────────────

export interface UpdateRow {
  id: string;
  report_id: string;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  kind: string;
  body: string;
  internal: boolean;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export function rowToUpdate(r: UpdateRow): IncidentUpdate {
  return {
    id: r.id,
    incidentId: r.report_id,
    authorId: r.author_id ?? undefined,
    authorName: r.author_name || 'Public Safety',
    authorRole: (r.author_role as IncidentUpdate['authorRole']) ?? undefined,
    kind: (['note', 'status', 'assignment', 'priority', 'system', 'sighting'].includes(r.kind)
      ? r.kind
      : 'note') as IncidentUpdate['kind'],
    body: r.body,
    internal: Boolean(r.internal),
    createdAt: ts(r.created_at) ?? Date.now(),
    meta: r.meta ?? undefined,
  };
}

export interface BoloRow {
  id: string;
  kind: string;
  title: string;
  summary: string;
  subject: unknown;
  vehicle: unknown;
  photo_path: string | null;
  report_ids: string[] | null;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  last_seen_location: string | null;
  last_seen_lat: number | null;
  last_seen_lng: number | null;
  sightings: number | null;
}

export function rowToBolo(r: BoloRow): Bolo {
  const subject = asSubjects(r.subject ? [r.subject] : [])[0];
  const vehicle = asVehicles(r.vehicle ? [r.vehicle] : [])[0];
  return {
    id: r.id,
    kind: r.kind === 'vehicle' ? 'vehicle' : 'person',
    title: r.title,
    summary: r.summary ?? '',
    subject,
    vehicle,
    photo: r.photo_path ?? undefined,
    incidentIds: r.report_ids ?? [],
    status: r.status === 'cleared' || r.status === 'expired' ? r.status : 'active',
    createdBy: r.created_by ?? undefined,
    createdByName: r.created_by_name || 'Public Safety',
    createdAt: ts(r.created_at) ?? Date.now(),
    expiresAt: ts(r.expires_at) ?? Date.now() + 7 * 86_400_000,
    lastSeenAt: ts(r.last_seen_at),
    lastSeenLocation: r.last_seen_location ?? undefined,
    lastSeenLat: r.last_seen_lat ?? undefined,
    lastSeenLng: r.last_seen_lng ?? undefined,
    sightings: r.sightings ?? 0,
  };
}
