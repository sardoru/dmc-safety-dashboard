import type {
  CategoryKey,
  NewIncidentInput,
  Priority,
  ReportKind,
  ReportSource,
  SubjectDescription,
  UserProfile,
  VehicleDescription,
} from '../../types';
import type { CapturedReport, CapturedSubject, CapturedVehicle } from '../../lib/live';
import type { Place } from '../../lib/geo';
import { categoryFromLabel, categoryMeta, isCategoryKey, suggestPriority, toPriority } from '../../lib/taxonomy';
import { generateId, shortAddress } from '../../lib/format';

/** Everything the reporter has told us so far, from any input method. */
export interface ReportDraft {
  category: CategoryKey | null;
  priority: Priority;
  /** The reporter (or AI) chose the priority explicitly. */
  priorityTouched: boolean;
  title: string;
  description: string;
  happeningNow: boolean;
  weaponsSeen: boolean;
  injuries: boolean;
  place: Place | null;
  locationNote: string;
  /** Free-text location the interviewer heard, before it is pinned. */
  locationHint: string;
  occurredMode: 'now' | 'earlier';
  /** `datetime-local` value when occurredMode is "earlier". */
  occurredAt: string;
  /** "About twenty minutes ago" — what the interviewer heard, if not parseable. */
  whenHint: string;
  subjects: SubjectDescription[];
  vehicles: VehicleDescription[];
  photos: File[];
  shareWithBusinesses: boolean;
  contactOk: boolean;
  transcript: string;
  /** Fields the AI filled — highlighted for review. */
  aiFields: string[];
  method: ReportKind;
}

export function emptyDraft(method: ReportKind = 'form'): ReportDraft {
  return {
    category: null,
    priority: 3,
    priorityTouched: false,
    title: '',
    description: '',
    happeningNow: false,
    weaponsSeen: false,
    injuries: false,
    place: null,
    locationNote: '',
    locationHint: '',
    occurredMode: 'now',
    occurredAt: '',
    whenHint: '',
    subjects: [],
    vehicles: [],
    photos: [],
    shareWithBusinesses: true,
    contactOk: true,
    transcript: '',
    aiFields: [],
    method,
  };
}

export function businessPlace(profile: UserProfile | null): Place | null {
  return profile ? { lat: profile.lat, lng: profile.lng, address: profile.address } : null;
}

/** The priority to show: explicit choice, else what the category + flags suggest. */
export function effectivePriority(d: ReportDraft): Priority {
  if (d.priorityTouched || !d.category) return d.priority;
  return suggestPriority(d.category, d);
}

export function captureSubject(s: CapturedSubject): SubjectDescription {
  return {
    id: generateId(),
    ageRange: s.age_range,
    sex: s.sex,
    height: s.height,
    build: s.build,
    hair: s.hair,
    clothingTop: s.clothing_top,
    clothingBottom: s.clothing_bottom,
    footwear: s.footwear,
    distinguishing: s.distinguishing_features,
    behavior: s.behavior,
    direction: s.direction_of_travel,
  };
}

export function captureVehicle(v: CapturedVehicle): VehicleDescription {
  return {
    id: generateId(),
    make: v.make,
    model: v.model,
    color: v.color,
    bodyType: v.body_type,
    plate: v.plate,
    plateState: v.plate_state,
    direction: v.direction_of_travel,
    notes: v.notes,
  };
}

/**
 * Merge a report filed by the voice interviewer (or AI extraction) into the
 * draft. The AI's latest call is the complete picture, so lists are replaced.
 */
export function mergeCapture(d: ReportDraft, c: CapturedReport, profile: UserProfile | null): ReportDraft {
  const fields: string[] = [];
  const next: ReportDraft = { ...d };
  const key = isCategoryKey(c.category) ? c.category : categoryFromLabel(c.category);
  if (key) {
    next.category = key;
    fields.push('category');
  }
  if (typeof c.priority === 'number') {
    next.priority = toPriority(c.priority, categoryMeta(key).defaultPriority);
    next.priorityTouched = true;
    fields.push('priority');
  }
  if (c.title?.trim()) {
    next.title = c.title.trim();
    fields.push('title');
  }
  if (c.description?.trim()) {
    next.description = c.description.trim();
    fields.push('description');
  }
  if (typeof c.happening_now === 'boolean') next.happeningNow = c.happening_now;
  if (typeof c.weapons_seen === 'boolean') next.weaponsSeen = c.weapons_seen;
  if (typeof c.injuries === 'boolean') next.injuries = c.injuries;
  if (typeof c.contact_ok === 'boolean') next.contactOk = c.contact_ok;
  if (c.subjects?.length) {
    next.subjects = c.subjects.map(captureSubject);
    fields.push('subjects');
  }
  if (c.vehicles?.length) {
    next.vehicles = c.vehicles.map(captureVehicle);
    fields.push('vehicles');
  }
  if (c.at_reporter_location && profile && !c.location_hint) {
    next.place = businessPlace(profile);
    fields.push('place');
  }
  if (c.location_hint?.trim()) {
    next.locationHint = c.location_hint.trim();
    fields.push('place');
  }
  const when = c.occurred_at_hint?.trim();
  if (when && !/^(now|just now|right now|happening now)$/i.test(when)) {
    const ago = parseAgo(when);
    if (ago !== null) {
      next.occurredMode = 'earlier';
      next.occurredAt = toLocalInput(Date.now() - ago);
    } else {
      next.whenHint = when;
    }
    fields.push('when');
  }
  next.aiFields = Array.from(new Set([...d.aiFields, ...fields]));
  return next;
}

/**
 * "Organize with AI" on the form: tidy the description and fill only what the
 * reporter left empty. Never undo a choice — a ticked weapon / injury /
 * happening-now flag stays ticked, and the priority keeps following the
 * category and flags unless the reporter set it.
 */
export function organizeInto(d: ReportDraft, c: CapturedReport): ReportDraft {
  const fields: string[] = [];
  const next: ReportDraft = { ...d };
  if (!d.category) {
    const key = isCategoryKey(c.category) ? c.category : categoryFromLabel(c.category);
    if (key) {
      next.category = key;
      fields.push('category');
    }
  }
  if (!d.title.trim() && c.title?.trim()) {
    next.title = c.title.trim();
    fields.push('title');
  }
  if (c.description?.trim()) {
    next.description = c.description.trim();
    fields.push('description');
  }
  next.happeningNow = d.happeningNow || c.happening_now === true;
  next.weaponsSeen = d.weaponsSeen || c.weapons_seen === true;
  next.injuries = d.injuries || c.injuries === true;
  if (!d.subjects.length && c.subjects?.length) {
    next.subjects = c.subjects.map(captureSubject);
    fields.push('subjects');
  }
  if (!d.vehicles.length && c.vehicles?.length) {
    next.vehicles = c.vehicles.map(captureVehicle);
    fields.push('vehicles');
  }
  if (!d.place && !d.locationHint.trim() && c.location_hint?.trim()) {
    next.locationHint = c.location_hint.trim();
    fields.push('place');
  }
  next.aiFields = Array.from(new Set([...d.aiFields, ...fields]));
  return next;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, few: 3, couple: 2,
};

/** "about 20 minutes ago" / "an hour ago" → milliseconds, or null. */
export function parseAgo(text: string): number | null {
  const m = text.toLowerCase().match(/(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|fifty|few|couple)\s*(?:of\s+)?(minute|min|hour|hr)s?\s+ago/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
  if (!n) return null;
  return n * (m[2].startsWith('h') ? 3_600_000 : 60_000);
}

/** A timestamp as a `datetime-local` input value in local time. */
export function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface DraftIssue {
  field: 'category' | 'place' | 'description' | 'title';
  message: string;
}

export function validateDraft(d: ReportDraft): DraftIssue[] {
  const issues: DraftIssue[] = [];
  if (!d.category) issues.push({ field: 'category', message: 'Pick what kind of incident this is.' });
  if (!d.place) issues.push({ field: 'place', message: 'Pin where it happened on the map.' });
  if (!d.description.trim() && !d.title.trim() && !d.subjects.length && !d.vehicles.length) {
    issues.push({ field: 'description', message: 'Add a short description of what you saw.' });
  }
  return issues;
}

export function suggestedTitle(d: ReportDraft): string {
  if (d.title.trim()) return d.title.trim();
  const cat = d.category ? categoryMeta(d.category).short : 'Report';
  const where = d.place?.address ? shortAddress(d.place.address).split(',')[0] : d.locationHint;
  return where ? `${cat} near ${where}` : cat;
}

export function draftToInput(
  d: ReportDraft,
  ctx: { source: ReportSource; reporterName: string; businessId?: string; contactPhone?: string },
): NewIncidentInput {
  const category = d.category ?? 'other';
  const occurredAt =
    d.occurredMode === 'earlier' && d.occurredAt ? new Date(d.occurredAt).getTime() : Date.now();
  return {
    source: ctx.source,
    kind: d.method,
    category,
    priority: effectivePriority({ ...d, category }),
    title: suggestedTitle(d).slice(0, 120),
    description:
      [d.description.trim() || suggestedTitle(d), d.occurredMode === 'now' && d.whenHint ? `When: ${d.whenHint}.` : '']
        .filter(Boolean)
        .join(' '),
    transcript: d.transcript.trim() || undefined,
    address: d.place?.address ?? d.locationHint ?? '',
    locationNote: [d.locationNote.trim(), d.locationHint && d.place?.address && !d.place.address.includes(d.locationHint) ? `Said: “${d.locationHint}”` : '']
      .filter(Boolean)
      .join(' · ') || undefined,
    lat: d.place?.lat ?? 35.1446,
    lng: d.place?.lng ?? -90.0509,
    occurredAt: Number.isFinite(occurredAt) ? occurredAt : Date.now(),
    happeningNow: d.happeningNow,
    weaponsSeen: d.weaponsSeen,
    injuries: d.injuries,
    subjects: d.subjects,
    vehicles: d.vehicles,
    photoFiles: d.photos,
    visibility: d.shareWithBusinesses ? 'community' : 'officers',
    contactOk: d.contactOk,
    contactPhone: ctx.contactPhone,
    businessId: ctx.businessId,
    reporterName: ctx.reporterName,
  };
}

export function isEmergency(d: Pick<ReportDraft, 'category' | 'happeningNow' | 'weaponsSeen' | 'injuries'>): boolean {
  if (d.weaponsSeen || d.injuries) return true;
  if (!d.category) return false;
  return categoryMeta(d.category).group === 'emergency' && d.happeningNow;
}
