import type { Bolo, Incident, Priority } from '../types';
import { categoryMeta, PRIORITIES, STATUSES } from './taxonomy';
import { shortAddress, spellRef } from './format';
import { distanceMiles, formatDistance } from './geo';

/**
 * Text builders for everything the dashboard says out loud (ElevenLabs v4 or
 * the browser fallback). Written for the ear: no abbreviations, no symbols.
 */
const STREET_WORDS: [RegExp, string][] = [
  [/\bSt\b\.?/g, 'Street'],
  [/\bAve\b\.?/g, 'Avenue'],
  [/\bBlvd\b\.?/g, 'Boulevard'],
  [/\bDr\b\.?/g, 'Drive'],
  [/\bPl\b\.?/g, 'Place'],
  [/\bSq\b\.?/g, 'Square'],
  [/\bRd\b\.?/g, 'Road'],
  [/\bPkwy\b\.?/g, 'Parkway'],
  [/\bN\b\.?(?=\s)/g, 'North'],
  [/\bS\b\.?(?=\s)/g, 'South'],
  [/\bE\b\.?(?=\s)/g, 'East'],
  [/\bW\b\.?(?=\s)/g, 'West'],
  [/&/g, 'and'],
  [/\b2nd\b/g, 'Second'],
  [/\b3rd\b/g, 'Third'],
  [/\b4th\b/g, 'Fourth'],
];

/** General text: tidy whitespace and symbols; leave words alone ("St. Jude" stays). */
export function speakable(text: string): string {
  return text.replace(/&/g, ' and ').replace(/\s+/g, ' ').trim();
}

/** Addresses: expand street abbreviations so the voice says "Street", not "S-T". */
export function speakableAddress(address: string): string {
  let out = address;
  for (const [re, word] of STREET_WORDS) out = out.replace(re, word);
  return out.replace(/\s+/g, ' ').trim();
}

export function spokenPlace(inc: Pick<Incident, 'address' | 'locationNote'>): string {
  return speakableAddress(shortAddress(inc.address) || 'downtown');
}

const PRIORITY_WORDS: Record<Priority, string> = {
  1: 'Priority one, critical',
  2: 'Priority two',
  3: 'Priority three',
  4: 'Priority four',
};

/** What officers hear when a new report lands. */
export function officerAnnouncement(inc: Incident): string {
  const cat = categoryMeta(inc.category).short;
  const flags = [inc.happeningNow && 'happening now', inc.weaponsSeen && 'weapon reported', inc.injuries && 'injuries reported']
    .filter(Boolean)
    .join(', ');
  const who = inc.source === 'officer' ? `by ${inc.reporterName}` : `by ${inc.reporterName}`;
  return speakable(
    `New report. ${PRIORITY_WORDS[inc.priority]}. ${cat}${flags ? `, ${flags}` : ''}, near ${spokenPlace(inc)}. ${inc.title}. Reported ${who}.`,
  );
}

/** What a business hears for a community alert close to them. */
export function nearbyAnnouncement(inc: Incident, from?: { lat: number; lng: number }): string {
  const cat = categoryMeta(inc.category).short.toLowerCase();
  const dist = from ? formatDistance(distanceMiles(from.lat, from.lng, inc.lat, inc.lng)) : '';
  const away = dist ? `, about ${dist.replace('ft', 'feet').replace('mi', 'miles')} from you` : '';
  return speakable(`Safety alert nearby: ${cat} near ${spokenPlace(inc)}${away}. ${inc.title}.`);
}

/** Read-back after a business files a report. */
export function confirmationReadback(inc: Incident): string {
  const cat = categoryMeta(inc.category).short.toLowerCase();
  return speakable(
    `Thank you. Your ${cat} report near ${spokenPlace(inc)} has been sent to Downtown public safety officers. ` +
      `Your reference is ${spellRef(inc.ref)}. You'll see updates on your dashboard as officers respond. ` +
      `If anyone is in danger, call 9 1 1.`,
  );
}

/** Status change heard by the person who filed the report. */
export function statusAnnouncement(inc: Incident): string {
  const label = STATUSES[inc.status].reporterLabel.toLowerCase();
  return speakable(`Update on your report, ${inc.title}: ${label}.`);
}

/** Full read-out for the "Listen" button on an incident. */
export function incidentReadout(inc: Incident): string {
  const meta = categoryMeta(inc.category);
  const parts = [
    `${PRIORITIES[inc.priority].label} priority ${meta.short.toLowerCase()}. ${inc.title}.`,
    `Location: ${spokenPlace(inc)}${inc.locationNote ? `, ${inc.locationNote}` : ''}.`,
    inc.description,
    ...inc.subjects.map((s, i) => {
      const bits = [s.sex, s.ageRange, s.height, s.build, s.hair, s.clothingTop, s.clothingBottom, s.footwear, s.distinguishing]
        .filter(Boolean)
        .join(', ');
      return `Person ${i + 1}: ${bits || 'no description'}${s.direction ? `. Last seen heading ${s.direction}` : ''}.`;
    }),
    ...inc.vehicles.map((v, i) => {
      const bits = [v.color, v.make, v.model, v.bodyType].filter(Boolean).join(' ');
      return `Vehicle ${i + 1}: ${bits || 'unknown'}${v.plate ? `, plate ${v.plate}` : ''}${v.direction ? `, heading ${v.direction}` : ''}.`;
    }),
    `Status: ${STATUSES[inc.status].label}.`,
  ];
  return speakable(parts.join(' '));
}

export function boloReadout(b: Bolo): string {
  const s = b.subject;
  const v = b.vehicle;
  const desc = s
    ? [s.sex, s.ageRange, s.height, s.build, s.hair, s.clothingTop, s.clothingBottom, s.footwear, s.distinguishing].filter(Boolean).join(', ')
    : v
      ? [v.color, v.make, v.model, v.bodyType, v.plate && `plate ${v.plate}`, v.notes].filter(Boolean).join(', ')
      : '';
  return speakable(
    `Be on the lookout. ${b.title}. ${b.summary} ${desc ? `Description: ${desc}.` : ''} ${
      b.lastSeenLocation ? `Last seen near ${speakableAddress(shortAddress(b.lastSeenLocation))}.` : ''
    } If you see this ${b.kind === 'vehicle' ? 'vehicle' : 'person'}, do not approach. Report it from the dashboard or call 9 1 1 if anyone is in danger.`,
  );
}

/** Deterministic briefing when the AI writer is unavailable. */
export function templateBriefing(incidents: Incident[], bolos: Bolo[], windowHours: number, now: number): string {
  const inWindow = incidents.filter((i) => now - i.createdAt <= windowHours * 3_600_000);
  const open = inWindow.filter((i) => STATUSES[i.status].open);
  const urgent = open.filter((i) => i.priority <= 2).sort((a, b) => a.priority - b.priority || b.createdAt - a.createdAt);
  const parts: string[] = [
    `Shift briefing for the last ${windowHours} hours. ${inWindow.length} ${inWindow.length === 1 ? 'report' : 'reports'}, ${open.length} still open.`,
  ];
  if (urgent.length) {
    parts.push(
      `High priority: ${urgent
        .slice(0, 4)
        .map((i) => `${categoryMeta(i.category).short.toLowerCase()} near ${spokenPlace(i)}, ${STATUSES[i.status].label.toLowerCase()}`)
        .join('; ')}.`,
    );
  } else {
    parts.push('No open high-priority reports.');
  }
  const counts = new Map<string, number>();
  for (const i of inWindow) counts.set(categoryMeta(i.category).short, (counts.get(categoryMeta(i.category).short) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] > 1) parts.push(`Most common: ${top[0].toLowerCase()}, ${top[1]} reports.`);
  const live = bolos.filter((b) => b.status === 'active');
  if (live.length) {
    parts.push(
      `${live.length} active be-on-the-lookout ${live.length === 1 ? 'notice' : 'notices'}: ${live
        .slice(0, 3)
        .map((b) => b.title)
        .join('; ')}.`,
    );
  }
  parts.push("That's the briefing. Stay safe out there.");
  return speakable(parts.join(' '));
}
