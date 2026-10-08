/**
 * Server copy of the incident vocabulary (the SPA has its own in
 * src/lib/taxonomy.ts — keep the labels in sync). Labels are what the
 * `reports.incident_type` column stores.
 */
export const CATEGORY_LABELS = [
  'Suspicious Person',
  'Suspicious Vehicle',
  'Suspicious Activity',
  'Theft / Shoplifting',
  'Break-in / Burglary',
  'Robbery',
  'Assault / Fight',
  'Weapon Sighting',
  'Vandalism / Graffiti',
  'Trespassing / Loitering',
  'Harassment / Disorderly',
  'Drug Activity',
  'Medical Emergency',
  'Fire / Hazard',
  'Noise Disturbance',
  'Other',
] as const;

export type CategoryLabel = (typeof CATEGORY_LABELS)[number];

/** Default priority (1 = critical … 4 = low) for each category. */
export const DEFAULT_PRIORITY: Record<CategoryLabel, 1 | 2 | 3 | 4> = {
  'Suspicious Person': 3,
  'Suspicious Vehicle': 3,
  'Suspicious Activity': 3,
  'Theft / Shoplifting': 3,
  'Break-in / Burglary': 2,
  Robbery: 1,
  'Assault / Fight': 1,
  'Weapon Sighting': 1,
  'Vandalism / Graffiti': 4,
  'Trespassing / Loitering': 4,
  'Harassment / Disorderly': 3,
  'Drug Activity': 3,
  'Medical Emergency': 1,
  'Fire / Hazard': 1,
  'Noise Disturbance': 4,
  Other: 4,
};

/** How the 1–4 scale is explained to the models. */
export const PRIORITY_GUIDE =
  '1 = emergency: violence, a weapon, a robbery, a serious injury, fire or a medical emergency, or anything happening right now that puts someone in danger. ' +
  '2 = high: a crime in progress or just happened without immediate danger (a break-in, a theft in progress, a threatening person). ' +
  '3 = medium: suspicious people, vehicles or activity, shoplifting after the fact, harassment, drug activity. ' +
  '4 = low: vandalism, trespassing or loitering, noise and quality-of-life issues.';

export function normalizeCategory(value: unknown): CategoryLabel {
  if (typeof value !== 'string') return 'Suspicious Activity';
  const exact = CATEGORY_LABELS.find((c) => c.toLowerCase() === value.trim().toLowerCase());
  if (exact) return exact;
  const v = value.toLowerCase();
  if (v.includes('vehicle') || v.includes('car')) return 'Suspicious Vehicle';
  if (v.includes('person') || v.includes('individual')) return 'Suspicious Person';
  if (v.includes('shoplift') || v.includes('theft') || v.includes('stole')) return 'Theft / Shoplifting';
  if (v.includes('burglar') || v.includes('break')) return 'Break-in / Burglary';
  if (v.includes('robber')) return 'Robbery';
  if (v.includes('assault') || v.includes('fight')) return 'Assault / Fight';
  if (v.includes('weapon') || v.includes('gun') || v.includes('knife')) return 'Weapon Sighting';
  if (v.includes('vandal') || v.includes('graffiti')) return 'Vandalism / Graffiti';
  if (v.includes('trespass') || v.includes('loiter')) return 'Trespassing / Loitering';
  if (v.includes('harass') || v.includes('disorderly')) return 'Harassment / Disorderly';
  if (v.includes('drug')) return 'Drug Activity';
  if (v.includes('medical')) return 'Medical Emergency';
  if (v.includes('fire') || v.includes('hazard')) return 'Fire / Hazard';
  if (v.includes('noise')) return 'Noise Disturbance';
  if (v.includes('suspicious')) return 'Suspicious Activity';
  return 'Other';
}

export function normalizePriority(value: unknown, category: CategoryLabel): 1 | 2 | 3 | 4 {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return DEFAULT_PRIORITY[category];
}

/** JSON schema for one described person (shared by the voice tool and extraction). */
export const SUBJECT_SCHEMA = {
  type: 'object',
  properties: {
    age_range: { type: 'string', description: 'Approximate age, e.g. "20s" or "about 40".' },
    sex: { type: 'string', description: 'As described by the reporter, if mentioned.' },
    height: { type: 'string', description: 'Approximate height.' },
    build: { type: 'string', description: 'Thin, medium, heavy, athletic…' },
    hair: { type: 'string', description: 'Hair colour/style, hat or hood.' },
    clothing_top: { type: 'string', description: 'Jacket, shirt, hoodie — colour and type.' },
    clothing_bottom: { type: 'string', description: 'Pants, shorts, skirt — colour and type.' },
    footwear: { type: 'string' },
    distinguishing_features: {
      type: 'string',
      description: 'Tattoos, scars, glasses, backpack, bicycle, anything that stands out.',
    },
    behavior: { type: 'string', description: 'What the person did that was concerning.' },
    direction_of_travel: { type: 'string', description: 'Where they went, on foot or otherwise.' },
  },
  additionalProperties: false,
} as const;

export const VEHICLE_SCHEMA = {
  type: 'object',
  properties: {
    make: { type: 'string' },
    model: { type: 'string' },
    color: { type: 'string' },
    body_type: { type: 'string', description: 'Sedan, SUV, pickup, van, motorcycle…' },
    plate: { type: 'string', description: 'Licence plate, even partial.' },
    plate_state: { type: 'string' },
    direction_of_travel: { type: 'string' },
    notes: { type: 'string', description: 'Damage, stickers, rims, anything distinctive.' },
  },
  additionalProperties: false,
} as const;

/** Trim and cap a free-text value coming back from a model. */
export function cleanText(value: unknown, max = 600): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

type Row = Record<string, string>;

/** Keep only non-empty, known string fields of a subject/vehicle object. */
export function cleanObjects(value: unknown, keys: readonly string[], max = 6): Row[] {
  if (!Array.isArray(value)) return [];
  const out: Row[] = [];
  for (const item of value.slice(0, max)) {
    if (!item || typeof item !== 'object') continue;
    const row: Row = {};
    for (const k of keys) {
      const v = cleanText((item as Record<string, unknown>)[k], 200);
      if (v) row[k] = v;
    }
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

export const SUBJECT_KEYS = Object.keys(SUBJECT_SCHEMA.properties);
export const VEHICLE_KEYS = Object.keys(VEHICLE_SCHEMA.properties);
