export type BusinessType = 'restaurant' | 'retail' | 'office' | 'bar' | 'hotel' | 'service' | 'other';

export type IncidentType =
  | 'Medical Emergency'
  | 'Suspicious Activity'
  | 'Property Crime'
  | 'Noise Disturbance'
  | 'Fire/Hazard'
  | 'Other';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

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

export interface Alert {
  id: string;
  businessId: string;
  businessName: string;
  address: string;
  incidentType: IncidentType;
  description: string;
  timestamp: number;
  status: AlertStatus;
  lat: number;
  lng: number;
  acknowledgedBy: string[];
  photo?: string;
}

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

export type Theme = 'light' | 'dark';

export type MobileTab = 'map' | 'radio' | 'alerts' | 'profile';

// ── Accounts / backend (Supabase) ────────────────────────────────────────────

export type Role = 'business' | 'officer' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  role: Role;
  display_name: string | null;
}

export type ReportKind = 'voice' | 'quick' | 'incident';
export type ReportSource = 'officer' | 'business';

/** A persisted report/alert row from the `reports` table. */
export interface Report {
  id: string;
  reporter_id: string | null;
  source: ReportSource;
  kind: ReportKind;
  incident_type: IncidentType;
  description: string;
  transcript: string | null;
  business_id: string | null;
  business_name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  status: AlertStatus;
  acknowledged_by: string[];
  created_at: string;
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
