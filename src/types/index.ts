// ── Businesses ───────────────────────────────────────────────────────────────

export type BusinessType = 'restaurant' | 'retail' | 'office' | 'bar' | 'hotel' | 'service' | 'other';

export interface Business {
  id: string;
  name: string;
  address: string;
  type: BusinessType;
  contactName: string;
  phone: string;
  email: string;
  lat: number;
  lng: number;
}

/** The signed-in user's own storefront. */
export interface UserProfile {
  id: string;
  businessName: string;
  address: string;
  businessType: BusinessType;
  contactName: string;
  phone: string;
  email: string;
  lat: number;
  lng: number;
  registeredAt: number;
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export type Role = 'business' | 'officer' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  display_name: string | null;
}

export interface OfficerInvite {
  id: string;
  email: string;
  role: Exclude<Role, 'business'>;
  status: 'pending' | 'claimed' | 'revoked';
  invited_by: string | null;
  created_at: string;
  claimed_at: string | null;
}

export interface PasskeyInfo {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export type Theme = 'light' | 'dark';

// ── Incidents ────────────────────────────────────────────────────────────────

export type CategoryKey =
  | 'suspicious_person'
  | 'suspicious_vehicle'
  | 'suspicious_activity'
  | 'theft'
  | 'burglary'
  | 'robbery'
  | 'assault'
  | 'weapon'
  | 'vandalism'
  | 'trespassing'
  | 'harassment'
  | 'drugs'
  | 'medical'
  | 'fire_hazard'
  | 'noise'
  | 'other';

export type Priority = 1 | 2 | 3 | 4;

/** `active` is the stored value for a new, untouched report. */
export type IncidentStatus = 'active' | 'acknowledged' | 'responding' | 'resolved' | 'dismissed';

export type ReportSource = 'officer' | 'business';
export type ReportKind = 'voice' | 'quick' | 'incident' | 'form';
export type Visibility = 'community' | 'officers';

export interface SubjectDescription {
  id: string;
  ageRange?: string;
  sex?: string;
  height?: string;
  build?: string;
  hair?: string;
  clothingTop?: string;
  clothingBottom?: string;
  footwear?: string;
  distinguishing?: string;
  behavior?: string;
  direction?: string;
}

export interface VehicleDescription {
  id: string;
  make?: string;
  model?: string;
  color?: string;
  bodyType?: string;
  plate?: string;
  plateState?: string;
  direction?: string;
  notes?: string;
}

export interface Incident {
  id: string;
  /** Short human reference, e.g. "DT-4F2A". */
  ref: string;
  source: ReportSource;
  kind: ReportKind;
  category: CategoryKey;
  /** The stored label (`incident_type`) — shown as-is for legacy rows. */
  categoryLabel: string;
  priority: Priority;
  status: IncidentStatus;
  title: string;
  description: string;
  transcript?: string;
  reporterId?: string;
  reporterName: string;
  businessId?: string;
  address: string;
  locationNote?: string;
  lat: number;
  lng: number;
  createdAt: number;
  occurredAt: number;
  updatedAt: number;
  happeningNow: boolean;
  weaponsSeen: boolean;
  injuries: boolean;
  subjects: SubjectDescription[];
  vehicles: VehicleDescription[];
  /** Storage paths (connected) or data URLs (demo). */
  photos: string[];
  assignedTo?: string;
  assignedName?: string;
  acknowledgedAt?: number;
  resolvedAt?: number;
  /** Users / businesses who marked the community alert as seen. */
  seenBy: string[];
  visibility: Visibility;
  contactOk: boolean;
  contactPhone?: string;
  boloId?: string;
  aiSummary?: string;
  /**
   * Someone else's community report as a member business gets it (`community_reports`, migration 0007): no
   * reporter, contact details, transcript, photos or internal fields — those never reach the browser.
   */
  limited?: boolean;
  /** How many photos it has, when `photos` is left out (`limited`). */
  photoCount?: number;
  /** How many members marked it as seen, when `seenBy` holds only you (`limited`). */
  seenCount?: number;
}

/** What a reporter submits; the context fills in the rest. */
export interface NewIncidentInput {
  source: ReportSource;
  kind: ReportKind;
  category: CategoryKey;
  priority: Priority;
  title: string;
  description: string;
  transcript?: string;
  address: string;
  locationNote?: string;
  lat: number;
  lng: number;
  occurredAt?: number;
  happeningNow?: boolean;
  weaponsSeen?: boolean;
  injuries?: boolean;
  subjects?: SubjectDescription[];
  vehicles?: VehicleDescription[];
  /** Files to upload (connected) — the context stores them and records paths. */
  photoFiles?: File[];
  visibility?: Visibility;
  contactOk?: boolean;
  contactPhone?: string;
  businessId?: string;
  reporterName: string;
  boloId?: string;
  aiSummary?: string;
}

export type UpdateKind = 'note' | 'status' | 'assignment' | 'priority' | 'system' | 'sighting';

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  authorId?: string;
  authorName: string;
  authorRole?: Role | 'system';
  kind: UpdateKind;
  body: string;
  internal: boolean;
  createdAt: number;
  meta?: Record<string, unknown>;
}

// ── BOLO board ───────────────────────────────────────────────────────────────

export type BoloStatus = 'active' | 'cleared' | 'expired';

export interface Bolo {
  id: string;
  kind: 'person' | 'vehicle';
  title: string;
  summary: string;
  subject?: SubjectDescription;
  vehicle?: VehicleDescription;
  photo?: string;
  incidentIds: string[];
  status: BoloStatus;
  createdBy?: string;
  createdByName: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt?: number;
  lastSeenLocation?: string;
  lastSeenLat?: number;
  lastSeenLng?: number;
  sightings: number;
}

export interface NewBoloInput {
  kind: 'person' | 'vehicle';
  title: string;
  summary: string;
  subject?: SubjectDescription;
  vehicle?: VehicleDescription;
  photo?: string;
  incidentIds?: string[];
  expiresInDays?: number;
  lastSeenAt?: number;
  lastSeenLocation?: string;
  lastSeenLat?: number;
  lastSeenLng?: number;
}

// ── Police scanner bridge ────────────────────────────────────────────────────

export interface RadioEntry {
  id: string;
  timestamp: number;
  speaker: string;
  channel: string;
  text: string;
  urgency: 'emergency' | 'caution' | 'routine';
  energy?: number;
  duration_seconds?: number;
}

export type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'mock';
export type ConnectionMode = 'live' | 'mock';

export interface RadioHealthResponse {
  status: string;
  uptime: number;
  transcriptions_count: number;
  clients_connected: number;
}
