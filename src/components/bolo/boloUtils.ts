import type { Bolo, Incident, NewBoloInput, SubjectDescription, VehicleDescription } from '../../types';
import { generateId } from '../../lib/format';

export type BoloState = 'active' | 'expired' | 'cleared';

/** Effective state: an "active" notice past its expiry reads as expired. */
export function boloState(b: Bolo, now: number): BoloState {
  if (b.status === 'cleared') return 'cleared';
  if (b.status === 'expired' || b.expiresAt <= now) return 'expired';
  return 'active';
}

/** "45m", "14h", "1d 6h", "5d". */
export function timeLeft(ms: number): string {
  if (ms <= 0) return '0m';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return hours % 24 ? `1d ${hours % 24}h` : '1d';
  return `${Math.round(ms / 86_400_000)}d`;
}

export const EXPIRY_OPTIONS = [
  { value: '3', label: '3 days' },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
] as const;

export type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]['value'];

export const SEX_OPTIONS = [
  { value: '', label: 'Not sure' },
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
];

export const BUILD_OPTIONS = [
  { value: '', label: 'Not sure' },
  { value: 'thin', label: 'Thin' },
  { value: 'medium', label: 'Medium' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'heavy', label: 'Heavy' },
];

export const BODY_TYPES = [
  { value: '', label: 'Not sure' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'SUV', label: 'SUV' },
  { value: 'pickup', label: 'Pickup truck' },
  { value: 'van', label: 'Van' },
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'other', label: 'Other' },
];

// ── Form ─────────────────────────────────────────────────────────────────────

export type PersonFields = Required<Omit<SubjectDescription, 'id' | 'behavior' | 'direction'>>;
export type VehicleFields = Required<Omit<VehicleDescription, 'id' | 'direction'>>;

export const EMPTY_PERSON: PersonFields = {
  ageRange: '',
  sex: '',
  height: '',
  build: '',
  hair: '',
  clothingTop: '',
  clothingBottom: '',
  footwear: '',
  distinguishing: '',
};

export const EMPTY_VEHICLE: VehicleFields = {
  color: '',
  make: '',
  model: '',
  bodyType: '',
  plate: '',
  plateState: 'TN',
  notes: '',
};

export interface FieldSpec<K extends string> {
  key: K;
  label: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Spans both columns. */
  wide?: boolean;
  maxLength?: number;
}

export const PERSON_FIELDS: FieldSpec<keyof PersonFields>[] = [
  { key: 'sex', label: 'Sex', options: SEX_OPTIONS },
  { key: 'ageRange', label: 'Age range', placeholder: 'e.g. mid-20s' },
  { key: 'height', label: 'Height', placeholder: 'e.g. about 5\'10"' },
  { key: 'build', label: 'Build', options: BUILD_OPTIONS },
  { key: 'hair', label: 'Hair / headwear', placeholder: 'e.g. braids, red headscarf' },
  { key: 'clothingTop', label: 'Top', placeholder: 'e.g. black puffer jacket' },
  { key: 'clothingBottom', label: 'Bottom', placeholder: 'e.g. gray sweatpants' },
  { key: 'footwear', label: 'Footwear', placeholder: 'e.g. white high-tops' },
  { key: 'distinguishing', label: 'Distinctive items or marks', placeholder: 'e.g. large blue tote bag, bike with a milk crate', wide: true },
];

export const VEHICLE_FIELDS: FieldSpec<keyof VehicleFields>[] = [
  { key: 'color', label: 'Color', placeholder: 'e.g. silver' },
  { key: 'make', label: 'Make', placeholder: 'e.g. Nissan' },
  { key: 'model', label: 'Model', placeholder: 'e.g. Altima' },
  { key: 'bodyType', label: 'Body type', options: BODY_TYPES },
  { key: 'plate', label: 'Plate', placeholder: 'Partial is fine, e.g. 7G4' },
  { key: 'plateState', label: 'Plate state', placeholder: 'TN', maxLength: 2 },
  { key: 'notes', label: 'Details', placeholder: 'Damage, window tint, stickers, rims', wide: true },
];

/** Keep a value that came from a report visible even if it isn't a preset option. */
export function withCurrent(options: { value: string; label: string }[], value: string): { value: string; label: string }[] {
  return !value || options.some((o) => o.value === value) ? options : [...options, { value, label: value }];
}

/** Trimmed, non-empty fields only. */
function compact<T extends object>(fields: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(fields)) {
    const value = typeof v === 'string' ? v.trim() : v;
    if (value) (out as Record<string, unknown>)[k] = value;
  }
  return out;
}

/** Something a passer-by could actually spot (sex alone is not enough). */
export function hasPersonDetail(p: PersonFields): boolean {
  return (Object.keys(p) as (keyof PersonFields)[]).some((k) => k !== 'sex' && p[k].trim() !== '');
}

export function hasVehicleDetail(v: VehicleFields): boolean {
  return Boolean(v.color.trim() || v.make.trim() || v.model.trim() || v.plate.trim() || v.notes.trim() || v.bodyType);
}

/** Copy a report's description into the form, keeping anything already typed. */
export function mergePerson(current: PersonFields, s: SubjectDescription): PersonFields {
  const next = { ...current };
  for (const key of Object.keys(EMPTY_PERSON) as (keyof PersonFields)[]) {
    if (!next[key].trim() && s[key]) next[key] = s[key] ?? '';
  }
  return next;
}

export function mergeVehicle(current: VehicleFields, v: VehicleDescription): VehicleFields {
  const next = { ...current };
  for (const key of Object.keys(EMPTY_VEHICLE) as (keyof VehicleFields)[]) {
    const incoming = v[key];
    const untouched = !next[key].trim() || (key === 'plateState' && next[key] === EMPTY_VEHICLE.plateState);
    if (incoming && untouched) next[key] = incoming;
  }
  return next;
}

export interface BoloDraft {
  kind: 'person' | 'vehicle';
  title: string;
  summary: string;
  person: PersonFields;
  vehicle: VehicleFields;
  expiry: ExpiryValue;
  linked: Incident[];
}

export function buildBoloInput(d: BoloDraft): NewBoloInput {
  const latest = [...d.linked].sort((a, b) => b.occurredAt - a.occurredAt)[0];
  const vehicle = compact(d.vehicle);
  if (vehicle.plateState && !vehicle.plate) delete vehicle.plateState;
  return {
    kind: d.kind,
    title: d.title.trim(),
    summary: d.summary.trim(),
    subject: d.kind === 'person' ? { id: generateId(), ...compact(d.person) } : undefined,
    vehicle:
      d.kind === 'vehicle'
        ? { id: generateId(), ...vehicle, plateState: vehicle.plateState?.toUpperCase() }
        : undefined,
    incidentIds: d.linked.map((i) => i.id),
    expiresInDays: Number(d.expiry),
    lastSeenAt: latest?.occurredAt,
    lastSeenLocation: latest?.address || undefined,
    lastSeenLat: latest?.lat,
    lastSeenLng: latest?.lng,
  };
}

// ── Display ──────────────────────────────────────────────────────────────────

export function personRows(s?: SubjectDescription): [string, string][] {
  if (!s) return [];
  const rows: [string, string | undefined][] = [
    ['Sex / age', [s.sex, s.ageRange].filter(Boolean).join(', ')],
    ['Height / build', [s.height, s.build].filter(Boolean).join(', ')],
    ['Hair / head', s.hair],
    ['Top', s.clothingTop],
    ['Bottom', s.clothingBottom],
    ['Footwear', s.footwear],
    ['Distinctive', s.distinguishing],
    ['Behavior', s.behavior],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}

export function vehicleRows(v?: VehicleDescription): [string, string][] {
  if (!v) return [];
  const rows: [string, string | undefined][] = [
    ['Vehicle', [v.color, v.make, v.model].filter(Boolean).join(' ')],
    ['Type', v.bodyType],
    ['Plate', v.plate ? `${v.plate}${v.plateState ? ` (${v.plateState})` : ''}` : undefined],
    ['Details', v.notes],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}
