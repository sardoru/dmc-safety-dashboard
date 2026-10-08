import type { LucideIcon } from 'lucide-react';
import {
  Car,
  CircleQuestionMark,
  Crosshair,
  DoorOpen,
  Eye,
  Flame,
  Footprints,
  HandCoins,
  HeartPulse,
  Megaphone,
  Pill,
  ShoppingBag,
  SprayCan,
  Swords,
  UserSearch,
  Volume2,
} from 'lucide-react';
import type { CategoryKey, IncidentStatus, Priority } from '../types';

// ── Categories ───────────────────────────────────────────────────────────────

export type CategoryGroup = 'watch' | 'crime' | 'emergency' | 'quality';

export interface CategoryMeta {
  key: CategoryKey;
  /** Stored in `reports.incident_type` — keep in sync with api/_lib/incidents.ts. */
  label: string;
  short: string;
  hint: string;
  icon: LucideIcon;
  group: CategoryGroup;
  defaultPriority: Priority;
  /** Whether the report form should prompt for people / vehicles. */
  asksPeople: boolean;
  asksVehicles: boolean;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: 'suspicious_person', label: 'Suspicious Person', short: 'Suspicious person', hint: 'Casing stores, trying doors, acting erratically', icon: UserSearch, group: 'watch', defaultPriority: 3, asksPeople: true, asksVehicles: false },
  { key: 'suspicious_vehicle', label: 'Suspicious Vehicle', short: 'Suspicious vehicle', hint: 'Circling, idling, plates covered', icon: Car, group: 'watch', defaultPriority: 3, asksPeople: true, asksVehicles: true },
  { key: 'suspicious_activity', label: 'Suspicious Activity', short: 'Suspicious activity', hint: 'Something feels off, nobody specific', icon: Eye, group: 'watch', defaultPriority: 3, asksPeople: true, asksVehicles: true },
  { key: 'theft', label: 'Theft / Shoplifting', short: 'Theft', hint: 'Merchandise or property taken', icon: ShoppingBag, group: 'crime', defaultPriority: 3, asksPeople: true, asksVehicles: true },
  { key: 'burglary', label: 'Break-in / Burglary', short: 'Break-in', hint: 'Forced entry, broken glass, pried door', icon: DoorOpen, group: 'crime', defaultPriority: 2, asksPeople: true, asksVehicles: true },
  { key: 'robbery', label: 'Robbery', short: 'Robbery', hint: 'Property taken by force or threat', icon: HandCoins, group: 'emergency', defaultPriority: 1, asksPeople: true, asksVehicles: true },
  { key: 'assault', label: 'Assault / Fight', short: 'Assault / fight', hint: 'Someone attacked or a fight underway', icon: Swords, group: 'emergency', defaultPriority: 1, asksPeople: true, asksVehicles: false },
  { key: 'weapon', label: 'Weapon Sighting', short: 'Weapon', hint: 'Gun, knife or other weapon seen', icon: Crosshair, group: 'emergency', defaultPriority: 1, asksPeople: true, asksVehicles: true },
  { key: 'vandalism', label: 'Vandalism / Graffiti', short: 'Vandalism', hint: 'Damage, tagging, broken fixtures', icon: SprayCan, group: 'quality', defaultPriority: 4, asksPeople: true, asksVehicles: false },
  { key: 'trespassing', label: 'Trespassing / Loitering', short: 'Trespassing', hint: 'Refusing to leave, blocking entrances', icon: Footprints, group: 'quality', defaultPriority: 4, asksPeople: true, asksVehicles: false },
  { key: 'harassment', label: 'Harassment / Disorderly', short: 'Harassment', hint: 'Aggressive panhandling, threats, disorder', icon: Megaphone, group: 'crime', defaultPriority: 3, asksPeople: true, asksVehicles: false },
  { key: 'drugs', label: 'Drug Activity', short: 'Drug activity', hint: 'Dealing or use in public', icon: Pill, group: 'crime', defaultPriority: 3, asksPeople: true, asksVehicles: true },
  { key: 'medical', label: 'Medical Emergency', short: 'Medical', hint: 'Someone hurt or unresponsive — call 911', icon: HeartPulse, group: 'emergency', defaultPriority: 1, asksPeople: false, asksVehicles: false },
  { key: 'fire_hazard', label: 'Fire / Hazard', short: 'Fire / hazard', hint: 'Fire, smoke, gas, downed lines', icon: Flame, group: 'emergency', defaultPriority: 1, asksPeople: false, asksVehicles: false },
  { key: 'noise', label: 'Noise Disturbance', short: 'Noise', hint: 'Excessive noise, amplified music', icon: Volume2, group: 'quality', defaultPriority: 4, asksPeople: false, asksVehicles: false },
  { key: 'other', label: 'Other', short: 'Other', hint: 'Anything else officers should know', icon: CircleQuestionMark, group: 'quality', defaultPriority: 4, asksPeople: true, asksVehicles: true },
];

export const CATEGORY_GROUPS: { key: CategoryGroup; label: string }[] = [
  { key: 'emergency', label: 'Urgent' },
  { key: 'watch', label: 'Suspicious' },
  { key: 'crime', label: 'Crime' },
  { key: 'quality', label: 'Quality of life' },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
const BY_LABEL = new Map(CATEGORIES.map((c) => [c.label.toLowerCase(), c]));

/** Labels written by earlier versions of the app. */
const LEGACY_LABELS: Record<string, CategoryKey> = {
  'suspicious activity': 'suspicious_activity',
  'property crime': 'theft',
  'medical emergency': 'medical',
  'noise disturbance': 'noise',
  'fire/hazard': 'fire_hazard',
  other: 'other',
};

export function categoryMeta(key: CategoryKey): CategoryMeta {
  return BY_KEY.get(key) ?? BY_KEY.get('other')!;
}

export function categoryFromLabel(label: string | null | undefined): CategoryKey {
  const l = (label ?? '').trim().toLowerCase();
  return BY_LABEL.get(l)?.key ?? LEGACY_LABELS[l] ?? 'other';
}

export function isCategoryKey(value: unknown): value is CategoryKey {
  return typeof value === 'string' && BY_KEY.has(value as CategoryKey);
}

// ── Priorities ───────────────────────────────────────────────────────────────

export interface PriorityMeta {
  value: Priority;
  short: string;
  label: string;
  description: string;
  /** Pin / chart colour. */
  hex: string;
  badge: string;
  dot: string;
  ring: string;
}

export const PRIORITIES: Record<Priority, PriorityMeta> = {
  1: {
    value: 1,
    short: 'P1',
    label: 'Critical',
    description: 'Danger to people — violence, weapons, medical, fire',
    hex: '#DC2626',
    badge: 'bg-red-600 text-white',
    dot: 'bg-red-500',
    ring: 'ring-red-500/40',
  },
  2: {
    value: 2,
    short: 'P2',
    label: 'High',
    description: 'Crime in progress or just happened',
    hex: '#EA580C',
    badge: 'bg-orange-500 text-white',
    dot: 'bg-orange-500',
    ring: 'ring-orange-500/40',
  },
  3: {
    value: 3,
    short: 'P3',
    label: 'Medium',
    description: 'Suspicious people, vehicles or activity',
    hex: '#CA8A04',
    badge: 'bg-amber-400 text-amber-950',
    dot: 'bg-amber-400',
    ring: 'ring-amber-400/40',
  },
  4: {
    value: 4,
    short: 'P4',
    label: 'Low',
    description: 'Quality of life — vandalism, trespass, noise',
    hex: '#64748B',
    badge: 'bg-slate-500 text-white',
    dot: 'bg-slate-400',
    ring: 'ring-slate-400/40',
  },
};

export const PRIORITY_LIST: Priority[] = [1, 2, 3, 4];

export function toPriority(value: unknown, fallback: Priority = 3): Priority {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : fallback;
}

/** Bump urgency for things happening now / with weapons or injuries. */
export function suggestPriority(
  category: CategoryKey,
  flags: { happeningNow?: boolean; weaponsSeen?: boolean; injuries?: boolean } = {},
): Priority {
  let p = categoryMeta(category).defaultPriority;
  if (flags.weaponsSeen || flags.injuries) p = 1;
  else if (flags.happeningNow && p > 2) p = (p - 1) as Priority;
  return p;
}

// ── Statuses ─────────────────────────────────────────────────────────────────

export interface StatusMeta {
  value: IncidentStatus;
  label: string;
  /** Wording for the reporter's view of their own report. */
  reporterLabel: string;
  description: string;
  pill: string;
  dot: string;
  open: boolean;
}

export const STATUSES: Record<IncidentStatus, StatusMeta> = {
  active: {
    value: 'active',
    label: 'New',
    reporterLabel: 'Received',
    description: 'Waiting for an officer to pick it up',
    pill: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/25',
    dot: 'bg-rose-500',
    open: true,
  },
  acknowledged: {
    value: 'acknowledged',
    label: 'Acknowledged',
    reporterLabel: 'Seen by officers',
    description: 'An officer has reviewed it',
    pill: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
    dot: 'bg-amber-500',
    open: true,
  },
  responding: {
    value: 'responding',
    label: 'Responding',
    reporterLabel: 'Officer responding',
    description: 'An officer is on the way or on scene',
    pill: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-400/25',
    dot: 'bg-blue-500',
    open: true,
  },
  resolved: {
    value: 'resolved',
    label: 'Resolved',
    reporterLabel: 'Resolved',
    description: 'Handled and closed',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
    dot: 'bg-emerald-500',
    open: false,
  },
  dismissed: {
    value: 'dismissed',
    label: 'Closed',
    reporterLabel: 'Closed',
    description: 'Duplicate, unfounded or no action needed',
    pill: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-400/25',
    dot: 'bg-slate-400',
    open: false,
  },
};

export const STATUS_FLOW: IncidentStatus[] = ['active', 'acknowledged', 'responding', 'resolved'];

export function isOpen(status: IncidentStatus): boolean {
  return STATUSES[status]?.open ?? false;
}

export const RESOLUTIONS = [
  'Gone on arrival',
  'Subject moved along',
  'Report taken / MPD notified',
  'Arrest made',
  'Assisted the business',
  'Unfounded',
  'Duplicate report',
] as const;
