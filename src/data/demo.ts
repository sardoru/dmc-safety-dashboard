import type { Bolo, Business, Incident, IncidentUpdate, Role, UserProfile } from '../types';
import { categoryMeta } from '../lib/taxonomy';
import type { CategoryKey, IncidentStatus, Priority } from '../types';

/**
 * Demo-mode dataset (no Supabase configured). Business names are fictional —
 * real downtown streets, invented storefronts — so no real business is tied
 * to a made-up incident.
 */

export const DEMO_BUSINESSES: Business[] = [
  { id: 'biz-riverbluff', name: 'Riverbluff Coffee Co.', address: '115 S Main St', type: 'restaurant', contactName: 'Dana Whitfield', phone: '(901) 555-0142', email: 'dana@riverbluff.example', lat: 35.1433, lng: -90.0521 },
  { id: 'biz-bealehall', name: 'Beale Street Music Hall', address: '159 Beale St', type: 'bar', contactName: 'Marcus Reed', phone: '(901) 555-0187', email: 'ops@bealehall.example', lat: 35.1391, lng: -90.0524 },
  { id: 'biz-cottonrow', name: 'Cotton Row Hotel', address: '125 Union Ave', type: 'hotel', contactName: 'Priya Natarajan', phone: '(901) 555-0110', email: 'security@cottonrow.example', lat: 35.1461, lng: -90.0511 },
  { id: 'biz-courtsq', name: 'Court Square Books', address: '62 N Main St', type: 'retail', contactName: 'Ellen Park', phone: '(901) 555-0163', email: 'hello@courtsquarebooks.example', lat: 35.1479, lng: -90.0516 },
  { id: 'biz-southmain', name: 'South Main Gallery', address: '410 S Main St', type: 'retail', contactName: 'Theo Grant', phone: '(901) 555-0128', email: 'theo@southmaingallery.example', lat: 35.1361, lng: -90.0566 },
  { id: 'biz-ortega', name: "Ortega's Corner Market", address: '254 S Main St', type: 'retail', contactName: 'Luis Ortega', phone: '(901) 555-0195', email: 'luis@ortegasmarket.example', lat: 35.1391, lng: -90.0555 },
  { id: 'biz-frontdeli', name: 'Front Street Deli & Co.', address: '77 S Front St', type: 'restaurant', contactName: 'Hannah Brooks', phone: '(901) 555-0151', email: 'orders@frontstreetdeli.example', lat: 35.1446, lng: -90.0537 },
  { id: 'biz-peabodygarage', name: 'Peabody Place Parking', address: '150 Peabody Pl', type: 'service', contactName: 'Andre Collins', phone: '(901) 555-0177', email: 'andre@ppparking.example', lat: 35.1424, lng: -90.0503 },
  { id: 'biz-madisondiner', name: 'Madison Avenue Diner', address: '33 Madison Ave', type: 'restaurant', contactName: 'Rosa Jimenez', phone: '(901) 555-0136', email: 'rosa@madisondiner.example', lat: 35.1468, lng: -90.0531 },
  { id: 'biz-outfitters', name: 'Riverfront Outfitters', address: '251 Riverside Dr', type: 'retail', contactName: 'Ben Ashford', phone: '(901) 555-0122', email: 'ben@riverfrontoutfitters.example', lat: 35.1404, lng: -90.0571 },
  { id: 'biz-orpheumbistro', name: 'Orpheum Row Bistro', address: '205 S Main St', type: 'restaurant', contactName: 'Claire Dubois', phone: '(901) 555-0199', email: 'claire@orpheumrow.example', lat: 35.1414, lng: -90.0533 },
  { id: 'biz-thirdbarber', name: 'Third Street Barbershop', address: '200 S 3rd St', type: 'service', contactName: 'Jamal Price', phone: '(901) 555-0148', email: 'jamal@thirdstreetcuts.example', lat: 35.1409, lng: -90.0481 },
  { id: 'biz-plazabar', name: 'Plaza Sports Bar', address: '191 Beale St', type: 'bar', contactName: 'Kevin Moss', phone: '(901) 555-0170', email: 'kevin@plazasports.example', lat: 35.1386, lng: -90.0506 },
  { id: 'biz-pinchpizza', name: 'Pinch District Pizza', address: '380 N Main St', type: 'restaurant', contactName: 'Gina Russo', phone: '(901) 555-0184', email: 'gina@pinchpizza.example', lat: 35.1542, lng: -90.0491 },
  { id: 'biz-monroeflorist', name: 'Monroe Avenue Florist', address: '88 Monroe Ave', type: 'retail', contactName: 'Iris Coleman', phone: '(901) 555-0115', email: 'iris@monroeflorist.example', lat: 35.1451, lng: -90.0519 },
  { id: 'biz-civiccleaners', name: 'Civic Center Cleaners', address: '125 N Main St', type: 'service', contactName: 'Sam Yoon', phone: '(901) 555-0132', email: 'sam@civiccleaners.example', lat: 35.1491, lng: -90.0512 },
  { id: 'biz-tower', name: 'One Commerce Tower (lobby desk)', address: '1 Commerce Sq', type: 'office', contactName: 'Rachel Kim', phone: '(901) 555-0104', email: 'lobby@onecommerce.example', lat: 35.1453, lng: -90.0528 },
  { id: 'biz-mudisland', name: 'Mud Island Ferry Kiosk', address: '125 N Front St', type: 'service', contactName: 'Owen Hart', phone: '(901) 555-0191', email: 'owen@ferrykiosk.example', lat: 35.1499, lng: -90.0541 },
];

/** The demo business account's own storefront. */
export const DEMO_MY_BUSINESS_ID = 'biz-riverbluff';

export function demoBusinessProfile(): UserProfile {
  const b = DEMO_BUSINESSES.find((x) => x.id === DEMO_MY_BUSINESS_ID)!;
  return {
    id: b.id,
    businessName: b.name,
    address: `${b.address}, Memphis, TN 38103`,
    businessType: b.type,
    contactName: b.contactName,
    phone: b.phone,
    email: b.email,
    lat: b.lat,
    lng: b.lng,
    registeredAt: Date.now() - 40 * 86_400_000,
  };
}

export interface DemoPersona {
  id: string;
  name: string;
  email: string;
}

export const DEMO_PERSONAS: Record<Role, DemoPersona> = {
  business: { id: 'demo-user-business', name: 'Dana Whitfield', email: 'dana@riverbluff.example' },
  officer: { id: 'demo-user-officer', name: 'Officer T. Hayes', email: 't.hayes@downtownsafety.example' },
  admin: { id: 'demo-user-admin', name: 'Sgt. R. Delgado', email: 'r.delgado@downtownsafety.example' },
};

const OFFICERS = [
  { id: 'demo-user-officer', name: 'Officer T. Hayes' },
  { id: 'demo-officer-morris', name: 'Officer K. Morris' },
  { id: 'demo-user-admin', name: 'Sgt. R. Delgado' },
];

interface Seed {
  id: string;
  biz?: string;
  officer?: number;
  cat: CategoryKey;
  p: Priority;
  status: IncidentStatus;
  minsAgo: number;
  title: string;
  description: string;
  address?: string;
  lat?: number;
  lng?: number;
  kind?: Incident['kind'];
  now?: boolean;
  weapons?: boolean;
  injuries?: boolean;
  subjects?: Omit<Incident['subjects'][number], 'id'>[];
  vehicles?: Omit<Incident['vehicles'][number], 'id'>[];
  assigned?: number;
  ackAfter?: number;
  resolveAfter?: number;
  bolo?: string;
  visibility?: Incident['visibility'];
  locationNote?: string;
  notes?: { after: number; officer: number; body: string; internal?: boolean }[];
}

const SEEDS: Seed[] = [
  {
    id: 'demo-inc-01', biz: 'biz-ortega', cat: 'suspicious_person', p: 2, status: 'active', minsAgo: 4, kind: 'voice', now: true,
    title: 'Man trying car door handles on S Main St',
    description: 'Staff watched a man walk along parked cars on S Main St pulling on door handles, about six cars so far. Still on the block when they called.',
    subjects: [{ ageRange: '20s', sex: 'male', height: "about 5'10\"", build: 'thin', hair: 'black beanie', clothingTop: 'gray hoodie, red letters on back', clothingBottom: 'black joggers', footwear: 'white sneakers', behavior: 'pulling car door handles one by one', direction: 'north toward Beale St' }],
  },
  {
    id: 'demo-inc-02', biz: 'biz-southmain', cat: 'theft', p: 3, status: 'acknowledged', minsAgo: 22, kind: 'form', ackAfter: 6, assigned: 1,
    title: 'Two prints taken from front display',
    description: 'A woman concealed two framed prints in a large blue tote and left without paying. Store camera captured her face. She matches the BOLO for the South Main corridor.',
    bolo: 'demo-bolo-01',
    subjects: [{ ageRange: 'late 20s', sex: 'female', height: "5'6\"", build: 'medium', hair: 'braids, red headscarf', clothingTop: 'black puffer jacket, orange lining', clothingBottom: 'gray sweatpants', footwear: 'white high-tops', distinguishing: 'large blue tote bag', direction: 'north on Main toward Beale' }],
    notes: [{ after: 8, officer: 1, body: 'Checking the trolley stop at Main & Beale.', internal: false }],
  },
  {
    id: 'demo-inc-03', officer: 0, cat: 'harassment', p: 3, status: 'responding', minsAgo: 35, kind: 'voice', ackAfter: 1, assigned: 0,
    title: 'Aggressive panhandling outside FedExForum gate',
    description: 'Officer observed a man following pedestrians and blocking their path while demanding money, near the plaza gate on Beale.',
    address: 'Beale St & S 3rd St', lat: 35.1385, lng: -90.0489,
    subjects: [{ ageRange: '40s', sex: 'male', build: 'heavy', clothingTop: 'green army jacket', clothingBottom: 'blue jeans', distinguishing: 'carrying a cardboard sign', behavior: 'following and blocking pedestrians' }],
    notes: [{ after: 2, officer: 0, body: 'On foot from Beale & 2nd, two minutes out.' }],
  },
  {
    id: 'demo-inc-04', biz: 'biz-peabodygarage', cat: 'burglary', p: 2, status: 'acknowledged', minsAgo: 58, kind: 'form', ackAfter: 4, assigned: 2,
    title: 'Car window smashed on level 3',
    description: 'Attendant found a smashed passenger window on a parked SUV on level 3; glass on the ground and the glovebox open. A silver sedan was seen leaving fast right before.',
    locationNote: 'Level 3, near the Peabody Place elevator',
    bolo: 'demo-bolo-02',
    vehicles: [{ color: 'silver', make: 'Nissan', model: 'Altima', bodyType: 'sedan', plate: '7G4 (partial)', plateState: 'TN', notes: 'dark tint, dented rear bumper', direction: 'exited onto Peabody Pl westbound' }],
    notes: [{ after: 10, officer: 2, body: 'Pulling the garage camera footage with the manager.', internal: true }],
  },
  {
    id: 'demo-inc-05', biz: 'biz-bealehall', cat: 'assault', p: 1, status: 'resolved', minsAgo: 140, kind: 'quick', now: true, injuries: true, ackAfter: 1, resolveAfter: 38, assigned: 0,
    title: 'Fight outside the venue entrance',
    description: 'Two men fighting outside the front entrance after closing; one on the ground with a cut above his eye. Security separated them.',
    subjects: [
      { ageRange: '30s', sex: 'male', clothingTop: 'white t-shirt', clothingBottom: 'khaki shorts', behavior: 'throwing punches', direction: 'west on Beale' },
      { ageRange: '20s', sex: 'male', clothingTop: 'black polo', distinguishing: 'cut above left eye', behavior: 'on the ground, stayed on scene' },
    ],
    notes: [
      { after: 3, officer: 0, body: 'On scene. EMS requested for the injured man.' },
      { after: 36, officer: 0, body: 'Injured party treated and released. MPD report taken.' },
    ],
  },
  {
    id: 'demo-inc-06', biz: 'biz-courtsq', cat: 'vandalism', p: 4, status: 'resolved', minsAgo: 420, kind: 'form', ackAfter: 25, resolveAfter: 180, assigned: 1,
    title: 'Fresh graffiti on side wall',
    description: 'New spray-painted tags on the alley-facing wall overnight, about six feet wide.',
    locationNote: 'Alley side of the building, off Court Ave',
  },
  {
    id: 'demo-inc-07', biz: 'biz-cottonrow', cat: 'trespassing', p: 4, status: 'resolved', minsAgo: 300, kind: 'form', ackAfter: 12, resolveAfter: 50, assigned: 1,
    title: 'Person sleeping in the loading dock',
    description: 'Staff found a person asleep in the rear loading dock blocking deliveries. Not aggressive.',
    notes: [{ after: 48, officer: 1, body: 'Connected the person with Hospitality Hub outreach; dock is clear.' }],
  },
  {
    id: 'demo-inc-08', biz: 'biz-frontdeli', cat: 'suspicious_vehicle', p: 3, status: 'dismissed', minsAgo: 610, kind: 'form', ackAfter: 9, resolveAfter: 30,
    title: 'Van idling in the alley for an hour',
    description: 'White cargo van idling in the alley behind the deli for over an hour, driver watching the back doors.',
    vehicles: [{ color: 'white', make: 'Ford', model: 'Transit', bodyType: 'cargo van', plate: 'unknown' }],
    notes: [{ after: 28, officer: 2, body: 'Contractor for the building next door — waiting on a delivery window. No issue.' }],
  },
  {
    id: 'demo-inc-09', biz: 'biz-madisondiner', cat: 'medical', p: 1, status: 'resolved', minsAgo: 900, kind: 'quick', now: true, ackAfter: 1, resolveAfter: 25, assigned: 2,
    title: 'Man collapsed at the bus shelter',
    description: 'Man collapsed at the Madison Ave bus shelter, breathing but not responding. Staff called 911 and stayed with him.',
    notes: [{ after: 4, officer: 2, body: 'EMS on scene, transported to Regional One.' }],
  },
  {
    id: 'demo-inc-10', biz: 'biz-outfitters', cat: 'theft', p: 3, status: 'resolved', minsAgo: 1500, kind: 'form', ackAfter: 15, resolveAfter: 120, assigned: 1,
    bolo: 'demo-bolo-01',
    title: 'Jacket rack cleared out',
    description: 'Woman with a large blue tote stuffed three rain jackets into the bag and walked out. Matches the earlier South Main thefts.',
    subjects: [{ ageRange: '20s', sex: 'female', build: 'medium', clothingTop: 'black puffer jacket', clothingBottom: 'gray sweatpants', distinguishing: 'large blue tote bag', direction: 'toward Riverside Dr' }],
  },
  {
    id: 'demo-inc-11', officer: 1, cat: 'drugs', p: 3, status: 'acknowledged', minsAgo: 95, kind: 'voice', ackAfter: 0, assigned: 1,
    title: 'Hand-to-hand exchanges by the trolley stop',
    description: 'Repeated hand-to-hand exchanges between two men at the Main & Gayoso trolley stop over about twenty minutes.',
    address: 'Main St & Gayoso Ave', lat: 35.1436, lng: -90.0518,
    visibility: 'officers',
    subjects: [{ ageRange: '20s', sex: 'male', clothingTop: 'black windbreaker', distinguishing: 'red backpack' }],
  },
  {
    id: 'demo-inc-12', biz: 'biz-plazabar', cat: 'noise', p: 4, status: 'resolved', minsAgo: 1700, kind: 'form', ackAfter: 20, resolveAfter: 60,
    title: 'Amplified speaker on the plaza after midnight',
    description: 'Large portable speaker playing very loud music on the plaza past 1 a.m.',
  },
  {
    id: 'demo-inc-13', biz: 'biz-thirdbarber', cat: 'suspicious_activity', p: 3, status: 'active', minsAgo: 12, kind: 'form',
    title: 'Someone checking back doors along the alley',
    description: 'Customer saw a person trying the back doors of several shops in the alley between 3rd and 4th. Gone when staff went to look.',
    subjects: [{ clothingTop: 'dark rain jacket, hood up', clothingBottom: 'dark pants', footwear: 'boots', direction: 'toward Linden Ave' }],
  },
  {
    id: 'demo-inc-14', biz: 'biz-pinchpizza', cat: 'robbery', p: 1, status: 'resolved', minsAgo: 2600, kind: 'voice', now: true, weapons: true, ackAfter: 1, resolveAfter: 90, assigned: 0,
    title: 'Delivery driver robbed at gunpoint',
    description: 'Driver robbed of cash and phone at gunpoint while loading his car out front. Suspect ran north on Main. No injuries.',
    subjects: [{ ageRange: 'teens or early 20s', sex: 'male', height: "about 6'", build: 'thin', clothingTop: 'black ski mask, black hoodie', clothingBottom: 'black pants', behavior: 'pointed a handgun at the driver', direction: 'north on Main toward Jackson Ave' }],
    notes: [{ after: 2, officer: 0, body: 'MPD notified and on scene within 6 minutes.' }],
  },
  {
    id: 'demo-inc-15', biz: 'biz-monroeflorist', cat: 'burglary', p: 2, status: 'resolved', minsAgo: 3400, kind: 'form', ackAfter: 30, resolveAfter: 240, assigned: 2,
    bolo: 'demo-bolo-02',
    title: 'Delivery van broken into overnight',
    description: 'Florist delivery van had its side window broken overnight; a tablet and cash bag were taken. Neighbor saw a silver sedan parked beside it around 2 a.m.',
    vehicles: [{ color: 'silver', make: 'Nissan', bodyType: 'sedan', plate: 'starts with 7G', notes: 'tinted windows' }],
  },
  {
    id: 'demo-inc-16', biz: 'biz-mudisland', cat: 'fire_hazard', p: 1, status: 'resolved', minsAgo: 3900, kind: 'quick', now: true, ackAfter: 2, resolveAfter: 35,
    title: 'Smoke from a trash can on the ferry ramp',
    description: 'Smoke and small flames from a public trash can at the top of the ferry ramp. Staff used an extinguisher.',
  },
  {
    id: 'demo-inc-17', biz: 'biz-tower', cat: 'suspicious_person', p: 3, status: 'resolved', minsAgo: 4300, kind: 'form', ackAfter: 7, resolveAfter: 45, assigned: 1,
    title: 'Man photographing the lobby keypad',
    description: 'Man photographing the lobby badge readers and keypad on his phone, left when the desk officer approached.',
    subjects: [{ ageRange: '30s', sex: 'male', build: 'athletic', clothingTop: 'navy quarter-zip', clothingBottom: 'khakis', distinguishing: 'black backpack, wireless earbuds', direction: 'east on Monroe' }],
  },
  {
    id: 'demo-inc-18', biz: 'biz-riverbluff', cat: 'theft', p: 3, status: 'resolved', minsAgo: 5200, kind: 'form', ackAfter: 10, resolveAfter: 70, assigned: 1,
    title: 'Tip jar grabbed off the counter',
    description: 'A man grabbed the tip jar off the counter during the morning rush and ran out the side door.',
    subjects: [{ ageRange: '30s', sex: 'male', clothingTop: 'orange safety vest', clothingBottom: 'jeans', direction: 'toward Union Ave' }],
    notes: [{ after: 65, officer: 1, body: 'Footage reviewed with the owner; MPD report number on file.' }],
  },
  {
    id: 'demo-inc-19', biz: 'biz-riverbluff', cat: 'harassment', p: 3, status: 'acknowledged', minsAgo: 47, kind: 'voice', ackAfter: 5, assigned: 0,
    title: 'Customer threatening staff after refusal',
    description: 'A man became loud and threatening toward the barista after being asked to leave, then left on foot. He said he would come back.',
    subjects: [{ ageRange: '50s', sex: 'male', build: 'medium', hair: 'gray beard', clothingTop: 'tan Carhartt jacket', distinguishing: 'walks with a cane', behavior: 'shouting threats at staff', direction: 'north on Main' }],
    notes: [{ after: 9, officer: 0, body: 'Thanks for the report — we’ll do extra walk-bys on your block this afternoon.' }],
  },
  {
    id: 'demo-inc-20', biz: 'biz-civiccleaners', cat: 'other', p: 4, status: 'active', minsAgo: 75, kind: 'form',
    title: 'Streetlight out at the crosswalk',
    description: 'The streetlight at the Main St crosswalk in front of the shop has been out for three nights; the corner is very dark at closing.',
  },
];

const BOLO_SEEDS: (Omit<Bolo, 'createdAt' | 'expiresAt' | 'lastSeenAt'> & { minsAgo: number; lastSeenMinsAgo: number; expiresInDays: number })[] = [
  {
    id: 'demo-bolo-01', kind: 'person', status: 'active', minsAgo: 1440, lastSeenMinsAgo: 22, expiresInDays: 6,
    title: 'Repeat shoplifter — South Main corridor',
    summary: 'Linked to three thefts from galleries and outfitters along Main and Riverside. Conceals merchandise in a large blue tote and leaves quickly. Do not confront — call it in.',
    subject: { id: 's1', ageRange: 'mid-to-late 20s', sex: 'female', height: "5'6\"", build: 'medium', hair: 'braids, often a red headscarf', clothingTop: 'black puffer jacket with orange lining', clothingBottom: 'gray sweatpants', footwear: 'white high-tops', distinguishing: 'large blue tote bag' },
    incidentIds: ['demo-inc-02', 'demo-inc-10'],
    createdBy: 'demo-user-officer', createdByName: 'Officer T. Hayes',
    lastSeenLocation: '410 S Main St', lastSeenLat: 35.1361, lastSeenLng: -90.0566, sightings: 3,
  },
  {
    id: 'demo-bolo-02', kind: 'vehicle', status: 'active', minsAgo: 2900, lastSeenMinsAgo: 58, expiresInDays: 5,
    title: 'Silver sedan — vehicle break-ins',
    summary: 'Silver Nissan sedan seen at two vehicle break-ins around Peabody Place and Monroe. Partial plate 7G4, dark tint, dented rear bumper.',
    vehicle: { id: 'v1', color: 'silver', make: 'Nissan', model: 'Altima', bodyType: 'sedan', plate: '7G4…', plateState: 'TN', notes: 'dark window tint, dented rear bumper' },
    incidentIds: ['demo-inc-04', 'demo-inc-15'],
    createdBy: 'demo-user-admin', createdByName: 'Sgt. R. Delgado',
    lastSeenLocation: 'Peabody Place Parking, level 3', lastSeenLat: 35.1424, lastSeenLng: -90.0503, sightings: 2,
  },
];

export interface DemoData {
  incidents: Incident[];
  updates: IncidentUpdate[];
  bolos: Bolo[];
}

const MIN = 60_000;

export function buildDemoData(now = Date.now()): DemoData {
  const byId = new Map(DEMO_BUSINESSES.map((b) => [b.id, b]));
  const incidents: Incident[] = [];
  const updates: IncidentUpdate[] = [];

  for (const s of SEEDS) {
    const created = now - s.minsAgo * MIN;
    const biz = s.biz ? byId.get(s.biz) : undefined;
    const officer = s.officer !== undefined ? OFFICERS[s.officer] : undefined;
    const assigned = s.assigned !== undefined ? OFFICERS[s.assigned] : undefined;
    const meta = categoryMeta(s.cat);
    const ackAt = s.ackAfter !== undefined ? created + s.ackAfter * MIN : undefined;
    const resolvedAt = s.resolveAfter !== undefined ? created + s.resolveAfter * MIN : undefined;

    incidents.push({
      id: s.id,
      ref: `DT-${s.id.slice(-2).padStart(2, '0')}${(s.cat.charCodeAt(0) % 90).toString(16).toUpperCase().padStart(2, '0')}`,
      source: officer ? 'officer' : 'business',
      kind: s.kind ?? 'form',
      category: s.cat,
      categoryLabel: meta.label,
      priority: s.p,
      status: s.status,
      title: s.title,
      description: s.description,
      reporterId: officer ? officer.id : biz?.id === DEMO_MY_BUSINESS_ID ? 'demo-user-business' : `demo-owner-${biz?.id}`,
      reporterName: officer ? officer.name : biz?.name ?? 'Downtown business',
      businessId: biz?.id,
      address: s.address ?? (biz ? `${biz.address}, Memphis, TN` : 'Downtown Memphis'),
      locationNote: s.locationNote,
      lat: s.lat ?? biz?.lat ?? 35.1446,
      lng: s.lng ?? biz?.lng ?? -90.0509,
      createdAt: created,
      occurredAt: created - (s.now ? 0 : 5 * MIN),
      updatedAt: resolvedAt ?? ackAt ?? created,
      happeningNow: Boolean(s.now),
      weaponsSeen: Boolean(s.weapons),
      injuries: Boolean(s.injuries),
      subjects: (s.subjects ?? []).map((x, i) => ({ ...x, id: `${s.id}-s${i}` })),
      vehicles: (s.vehicles ?? []).map((x, i) => ({ ...x, id: `${s.id}-v${i}` })),
      photos: [],
      assignedTo: assigned?.id,
      assignedName: assigned?.name,
      acknowledgedAt: ackAt,
      resolvedAt,
      seenBy: s.status === 'active' ? [] : ['biz-cottonrow', 'biz-frontdeli'].slice(0, (s.minsAgo % 3) + 0),
      visibility: s.visibility ?? 'community',
      contactOk: true,
      contactPhone: biz?.phone,
      boloId: s.bolo,
    });

    const push = (after: number, kind: IncidentUpdate['kind'], body: string, who?: { id: string; name: string }, internal = false) =>
      updates.push({
        id: `${s.id}-u${updates.length}`,
        incidentId: s.id,
        authorId: who?.id,
        authorName: who?.name ?? 'System',
        authorRole: who ? 'officer' : 'system',
        kind,
        body,
        internal,
        createdAt: created + after * MIN,
      });

    push(0, 'system', `Report received ${s.kind === 'voice' ? 'by voice interview' : s.kind === 'quick' ? 'as a quick alert' : 'via the report form'}.`);
    if (ackAt !== undefined) push(s.ackAfter!, 'status', 'Acknowledged', assigned ?? OFFICERS[0]);
    if (assigned) push((s.ackAfter ?? 0) + 0.5, 'assignment', `Assigned to ${assigned.name}`, assigned);
    if (s.status === 'responding') push((s.ackAfter ?? 0) + 1, 'status', 'Responding', assigned ?? OFFICERS[0]);
    for (const n of s.notes ?? []) push(n.after, 'note', n.body, OFFICERS[n.officer], Boolean(n.internal));
    if (resolvedAt !== undefined) {
      push(s.resolveAfter!, 'status', s.status === 'dismissed' ? 'Closed — no action needed' : 'Resolved', assigned ?? OFFICERS[1]);
    }
  }

  const bolos: Bolo[] = BOLO_SEEDS.map(({ minsAgo, lastSeenMinsAgo, expiresInDays, ...b }) => ({
    ...b,
    createdAt: now - minsAgo * MIN,
    expiresAt: now - minsAgo * MIN + expiresInDays * 86_400_000,
    lastSeenAt: now - lastSeenMinsAgo * MIN,
  }));

  return { incidents, updates: updates.sort((a, b) => a.createdAt - b.createdAt), bolos };
}

/** Canned reports for the Ops Center's "simulate incoming report" button. */
export const DEMO_INCOMING: Seed[] = [
  {
    id: 'sim', biz: 'biz-orpheumbistro', cat: 'suspicious_person', p: 3, status: 'active', minsAgo: 0, kind: 'voice', now: true,
    title: 'Man looking into parked cars on S Main',
    description: 'Server saw a man cupping his hands to look into parked car windows along S Main, moving slowly south.',
    subjects: [{ ageRange: '30s', sex: 'male', clothingTop: 'blue rain jacket', clothingBottom: 'black jeans', distinguishing: 'bicycle with a milk crate', direction: 'south on Main' }],
  },
  {
    id: 'sim', biz: 'biz-cottonrow', cat: 'theft', p: 2, status: 'active', minsAgo: 0, kind: 'quick', now: true,
    title: 'Luggage taken from the hotel valet stand',
    description: 'A rolling suitcase was taken from the valet stand while the attendant parked a car. Suspect walking toward Second St.',
    subjects: [{ ageRange: '20s', sex: 'male', clothingTop: 'white hoodie', clothingBottom: 'black shorts', direction: 'east on Union toward 2nd St' }],
  },
  {
    id: 'sim', biz: 'biz-plazabar', cat: 'weapon', p: 1, status: 'active', minsAgo: 0, kind: 'voice', now: true, weapons: true,
    title: 'Man showing a knife in a dispute on Beale',
    description: 'Door staff saw a man pull a folding knife during an argument outside, then put it back in his pocket. Still in front of the bar.',
    subjects: [{ ageRange: '30s', sex: 'male', build: 'heavy', clothingTop: 'red flannel shirt', clothingBottom: 'blue jeans', behavior: 'displayed a folding knife during an argument' }],
  },
];

export function demoIncomingIncident(index: number, now = Date.now()): Incident {
  const seed = DEMO_INCOMING[index % DEMO_INCOMING.length];
  const biz = DEMO_BUSINESSES.find((b) => b.id === seed.biz)!;
  const id = `demo-live-${now.toString(36)}`;
  const meta = categoryMeta(seed.cat);
  return {
    id,
    ref: `DT-${now.toString(16).slice(-4).toUpperCase()}`,
    source: 'business',
    kind: seed.kind ?? 'voice',
    category: seed.cat,
    categoryLabel: meta.label,
    priority: seed.p,
    status: 'active',
    title: seed.title,
    description: seed.description,
    reporterId: `demo-owner-${biz.id}`,
    reporterName: biz.name,
    businessId: biz.id,
    address: `${biz.address}, Memphis, TN`,
    lat: biz.lat,
    lng: biz.lng,
    createdAt: now,
    occurredAt: now,
    updatedAt: now,
    happeningNow: Boolean(seed.now),
    weaponsSeen: Boolean(seed.weapons),
    injuries: false,
    subjects: (seed.subjects ?? []).map((x, i) => ({ ...x, id: `${id}-s${i}` })),
    vehicles: (seed.vehicles ?? []).map((x, i) => ({ ...x, id: `${id}-v${i}` })),
    photos: [],
    seenBy: [],
    visibility: 'community',
    contactOk: true,
    contactPhone: biz.phone,
  };
}
