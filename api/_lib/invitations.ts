import type { Role } from './auth.js';
import { escapeHtml, type BrandedEmail } from './emails.js';
import { chapterUrl, clock, FILM_SITE, FILMS, type Film, type FilmChapter } from './films.js';
import { siteUrl } from './membership.js';

/**
 * Invitation emails, curated to the role someone is joining as — a member
 * business, a Public Safety officer or an administrator. One builder for every
 * way in: an administrator's invite, an access code, an approved request to
 * join, and invitations Supabase sends itself.
 *
 * Copy rule: Memphis-facing words only. No vendor or technology names, nothing
 * about software deciding things, and the voice interview is an "it" — never a
 * person. The API harness renders every variant and fails on banned words.
 */

/** How they got here: an administrator invited them, they used an access code, or their request to join was approved. */
export type InviteSource = 'admin' | 'code' | 'request';

/**
 * `new`: a new address — the link creates the account.
 * `raised`: an existing account that now has `role` (it was lower).
 * `existing`: an existing account that already had `role` (roles are never lowered).
 */
export type InviteAccount = 'new' | 'raised' | 'existing';

export interface InvitationOptions {
  /** The role they have (or will have) once they open the link. */
  role: Role;
  source: InviteSource;
  account: InviteAccount;
  /** The recipient. */
  email: string;
  /** The one-time sign-in link. */
  url: string;
  /** Who invited or approved them, when known ("Officer Hayes"). */
  inviterName?: string | null;
  /** The access code they used (source `code`). */
  code?: string | null;
  /** App origin for the sign-in page and the live map; defaults to SITE_URL, then the public site. */
  site?: string;
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const BRAND = 'Core Downtown Memphis Safety Dashboard';

const ROLE_COPY: Record<Role, { name: string; a: string; title: string }> = {
  business: { name: 'member business', a: 'a member business', title: 'Member business' },
  officer: { name: 'Public Safety officer', a: 'a Public Safety officer', title: 'Public Safety officer' },
  admin: { name: 'administrator', a: 'an administrator', title: 'Administrator' },
};

/** Rich text: plain strings are always escaped; bold and links are explicit. */
type Seg = string | { b: string } | { text: string; href: string };
type Rich = Seg[];
const b = (text: string): Seg => ({ b: text });
const a = (text: string, href: string): Seg => ({ text, href });

interface Item {
  icon: string;
  label: string;
  body: Rich;
}
interface Group {
  title?: string;
  items: Item[];
}
interface Step {
  title: string;
  body: Rich;
}
interface FilmPick {
  film: Film;
  note?: Rich;
  chapters: FilmChapter[];
}
interface Line {
  icon: string;
  lead: string;
  body: Rich;
}

interface Content {
  subject: string;
  preheader: string;
  eyebrow: string;
  heading: string;
  intro: Rich[];
  button: string;
  buttonNote: Rich;
  canDoTitle: string;
  canDoLead: Rich;
  groups: Group[];
  steps: Step[];
  films: FilmPick[];
  safety: Line[];
  signIn: Rich[];
  help: Rich;
  footer: Rich[];
}

const F = FILMS;
const ch = F.howItWorks.chapters;
const rc = F.howToReport.chapters;

const BUSINESS_FEATURES: (live: string) => Item[] = (live) => [
  {
    icon: '🎙️',
    label: 'Report by voice',
    body: [
      'A short voice interview. The interviewer asks what happened, where and when, and fills in the report while you talk, and you check it before it’s sent.',
    ],
  },
  {
    icon: '📝',
    label: 'Guided form',
    body: ['Five short steps: what, where, when, who and details. It can read each question aloud, and you can dictate instead of typing.'],
  },
  {
    icon: '⚡',
    label: 'Quick alert',
    body: ['One tap for something happening right now at your door. Officers and nearby businesses are alerted at once.'],
  },
  {
    icon: '📋',
    label: 'My reports',
    body: [
      'Follow each report from ',
      b('Received'),
      ' to ',
      b('Seen by officers'),
      ', ',
      b('Officer responding'),
      ' and ',
      b('Resolved'),
      ', and add details for the officers at any time.',
    ],
  },
  {
    icon: '📍',
    label: 'Nearby and Your block',
    body: ['Alerts within half a mile of your storefront from the last 48 hours, as a list and on a map.'],
  },
  {
    icon: '🔊',
    label: 'Spoken alerts',
    body: ['Switch on ', b('Speak new reports aloud'), ' in Settings → Voice & alerts to hear nearby alerts and updates on your reports.'],
  },
  {
    icon: '🔎',
    label: 'Lookout board',
    body: [
      'Notices from Downtown public safety about people and vehicles tied to recent incidents. Spot a match? Tap ',
      b('I’ve seen this'),
      ' to report a sighting. Never approach.',
    ],
  },
  {
    icon: '🗺️',
    label: 'The public live map',
    body: ['What’s been reported downtown, open to anyone at ', a(display(live), live), ' whenever the public map is switched on: the type, priority, status and an approximate spot, never details or people.'],
  },
];

const OFFICER_FEATURES: Item[] = [
  {
    icon: '🖥️',
    label: 'Operations Center',
    body: ['Your home screen: the live queue by priority, P1 Critical to P4 Low, the district map, and each new report the moment it’s filed.'],
  },
  {
    icon: '🔔',
    label: 'Voice alerts',
    body: ['Tap the bell (', b('Voice alerts'), ') at the top of the Operations Center to hear new reports read aloud as they arrive. Choose which priorities are read out in Settings → Voice & alerts.'],
  },
  {
    icon: '📻',
    label: 'Shift briefing',
    body: ['A spoken summary of the last hours: what came in, what’s urgent and what’s still open.'],
  },
  {
    icon: '✅',
    label: 'Triage a report',
    body: [
      b('Acknowledge'),
      ' → ',
      b('Responding'),
      ' → ',
      b('Resolve'),
      ' with an outcome. Assign it, change its priority and add notes: internal notes stay with officers; the others are visible to the reporter.',
    ],
  },
  {
    icon: '🔎',
    label: 'Lookout board',
    body: ['Publish a BOLO (', b('New BOLO'), ') about a person or vehicle tied to recent incidents. Businesses report sightings straight to you.'],
  },
  {
    icon: '📊',
    label: 'Insights',
    body: ['How reports are trending downtown: volume and urgency, response times, and where and when incidents happen.'],
  },
  {
    icon: '📝',
    label: 'File reports too',
    body: ['Report by voice, with the guided form or with a quick alert, the same three ways businesses use.'],
  },
];

const ADMIN_OFFICER_FEATURES: Item[] = [
  {
    icon: '🖥️',
    label: 'Operations Center, Voice alerts and the Shift briefing',
    body: ['The live queue by priority (P1–P4), the district map, new reports read aloud and a spoken summary of the last hours.'],
  },
  {
    icon: '✅',
    label: 'Triage',
    body: ['Acknowledge → Responding → Resolve with an outcome; assign, change the priority, and keep notes internal or share them with the reporter.'],
  },
  {
    icon: '🔎',
    label: 'Lookout board and Insights',
    body: ['Publish BOLOs; see trends, hot spots and response times.'],
  },
];

const ADMIN_FEATURES: Item[] = [
  {
    icon: '👥',
    label: 'Team',
    body: ['Invite member businesses, Public Safety officers and administrators; follow pending invites; manage members’ passkeys; remove officer access.'],
  },
  {
    icon: '🔑',
    label: 'Access',
    body: ['Access codes with seats and an expiry date, who can join (open or invite-only), requests to join, and the public live map settings.'],
  },
  { icon: '🏢', label: 'Businesses', body: ['Every member business and its storefront.'] },
  { icon: '🧾', label: 'Activity', body: ['An append-only log of administrative changes; nobody can edit or delete it.'] },
  { icon: '⚙️', label: 'System', body: ['The health of the database, voice, speech and email connections.'] },
];

/** The films in the order that matters for the role; each lists only the chapters that matter (in film order). */
function filmsFor(role: Role): FilmPick[] {
  return pickFilms(role).map((p) => ({ ...p, chapters: [...p.chapters].sort((x, y) => x.start - y.start) }));
}

function pickFilms(role: Role): FilmPick[] {
  if (role === 'business') {
    return [
      { film: F.howToJoin, note: [b('Start here.')], chapters: [] },
      { film: F.howToReport, chapters: [rc.reportByVoice, rc.guidedForm, rc.quickAlert, rc.followStatus] },
      { film: F.howItWorks, chapters: [ch.signIn, ch.businessHome, ch.reportByVoice, ch.lookout] },
    ];
  }
  if (role === 'officer') {
    return [
      { film: F.howItWorks, chapters: [ch.opsCenter, ch.districtMap, ch.triage, ch.spokenAlerts, ch.lookout, ch.insights] },
      { film: F.howToReport, chapters: [rc.officersRespond, rc.reportByVoice] },
      { film: F.howToJoin, note: ['What businesses see when they join — handy when you help one get started.'], chapters: [] },
    ];
  }
  return [
    { film: F.howItWorks, chapters: [ch.team, ch.opsCenter, ch.triage, ch.spokenAlerts, ch.insights] },
    { film: F.howToJoin, note: ['Where your invitations and access codes lead: how businesses join and take part.'], chapters: [] },
    { film: F.howToReport, chapters: [rc.officersRespond] },
  ];
}

function subjectFor(o: InvitationOptions): string {
  const r = ROLE_COPY[o.role];
  const biz = o.role === 'business';
  if (o.source === 'request') {
    if (o.account === 'existing') return `Your request is approved — ${BRAND}`;
    return biz ? 'You’re approved — finish joining the Downtown Memphis safety network' : `You’re approved as ${r.a} — ${BRAND}`;
  }
  if (o.account === 'raised') return `You’re now ${r.a} — ${BRAND}`;
  if (o.source === 'code') {
    if (o.account === 'existing') return `Your access code is applied — ${BRAND}`;
    return biz ? 'Finish joining the Downtown Memphis safety network' : `Finish joining as ${r.a} — ${BRAND}`;
  }
  if (o.account === 'existing') return `Your ${r.name} access — ${BRAND}`;
  if (biz) return 'You’re invited to join the Downtown Memphis safety network';
  if (o.role === 'officer') return `Your Public Safety officer invitation — ${BRAND}`;
  return `You’re invited as an administrator — ${BRAND}`;
}

function headingFor(o: InvitationOptions): string {
  const r = ROLE_COPY[o.role];
  if (o.account === 'raised') return `You’re now ${r.a}`;
  if (o.source === 'request') return 'Your request is approved';
  if (o.source === 'code') return o.account === 'new' ? 'Your access code is accepted' : 'Your access code is applied';
  if (o.account === 'existing') return 'Your access is ready';
  return o.role === 'business' ? 'You’re invited to the Downtown Memphis safety network' : `You’re invited as ${r.a}`;
}

function eyebrowFor(o: InvitationOptions): string {
  const kind =
    o.source === 'code'
      ? 'Access code'
      : o.source === 'request'
        ? 'Request approved'
        : o.account === 'new'
          ? 'Invitation'
          : o.account === 'raised'
            ? 'New role'
            : 'Your access';
  return `${kind} · ${ROLE_COPY[o.role].title}`;
}

/** The first paragraph: who sent this, and the role it carries. */
function openingFor(o: InvitationOptions, who: string | null): Rich {
  const r = ROLE_COPY[o.role];
  if (o.source === 'code') {
    const lead: Rich = o.code ? ['Your access code ', b(o.code)] : ['Your access code'];
    if (o.account === 'new') return [...lead, ' is accepted. You’re joining the ', b(BRAND), ' as ', b(r.a), '.'];
    if (o.account === 'raised') return [...lead, ' made you ', b(r.a), ' on the ', b(BRAND), '.'];
    return [...lead, ' is applied. Your account keeps its ', b(r.name), ' access to the ', b(BRAND), '.'];
  }
  if (o.source === 'request') {
    const thanks = 'Thanks for asking to join. ';
    if (who) {
      const lead: Rich = [thanks, `${who} approved your request`];
      if (o.account === 'new') return [...lead, ' — you’re joining the ', b(BRAND), ' as ', b(r.a), '.'];
      if (o.account === 'raised') return [...lead, ', and you’re now ', b(r.a), ' on the ', b(BRAND), '.'];
      return [...lead, '. Your account already has ', b(r.name), ' access to the ', b(BRAND), '.'];
    }
    if (o.account === 'new') return [thanks, 'You’re approved to join the ', b(BRAND), ' as ', b(r.a), '.'];
    if (o.account === 'raised') return [thanks, 'Your account now has ', b(r.name), ' access to the ', b(BRAND), '.'];
    return [thanks, 'Your account already has ', b(r.name), ' access to the ', b(BRAND), ' — sign in any time.'];
  }
  if (o.account === 'new') {
    return [who ?? 'An administrator of the Downtown safety team', ' invited you to join the ', b(BRAND), ' as ', b(r.a), '.'];
  }
  if (o.account === 'raised') {
    return [who ?? 'An administrator', ' made you ', b(r.a), ' on the ', b(BRAND), '. You already have an account, so your new access works as soon as you sign in.'];
  }
  return [who ?? 'An administrator', ' sent you this guide to the ', b(BRAND), '. Your account already has ', b(r.name), ' access — sign in any time.'];
}

const ROLE_LEAD: Record<Role, string> = {
  business: 'As a member business, you can report an incident in under two minutes, follow it until it’s resolved, and hear about trouble near your storefront.',
  officer: 'As a Public Safety officer, you see each report the moment it’s filed and work it from the first alert to the outcome.',
  admin: 'As an administrator, you work reports like an officer and decide who’s on the network.',
};

const PREHEADER: Record<Role, string> = {
  business: 'Report what you see, follow every report and get alerts within half a mile of your storefront — no password needed.',
  officer: 'The live queue, the district map, voice alerts and triage tools — plus three short films to get you started.',
  admin: 'The Operations Center plus Team, Access, Businesses, Activity and System — and three short films to get you started.',
};

function stepsFor(o: InvitationOptions, button: string): Step[] {
  const isNew = o.account === 'new';
  const open: Step = { title: button, body: ['Tap the button above. There’s no password — the link signs you in.'] };
  const passkey = (optional: boolean): Step => ({
    title: optional ? 'Add a passkey (optional)' : 'Add a passkey',
    body: ['In ', b('Settings → Passkeys'), ', tap ', b('Add passkey'), '. Next time, sign in with Face ID, Touch ID or your device PIN.'],
  });

  if (o.role === 'business') {
    return [
      open,
      isNew
        ? {
            title: 'Register your storefront',
            body: ['In ', b('Settings'), ', add your business name and street address. Your address decides which nearby alerts you get.'],
          }
        : {
            title: 'Check your storefront',
            body: ['In ', b('Settings'), ', make sure your business name and street address are right — the address decides which nearby alerts you get.'],
          },
      passkey(true),
      {
        title: 'Watch the films',
        body: ['Start with ', a(`“${F.howToJoin.title}”`, F.howToJoin.url), ', then ', a(`“${F.howToReport.title}”`, F.howToReport.url), '.'],
      },
    ];
  }

  const staff: Step[] = [
    open,
    { title: 'Open the Operations Center', body: ['It’s your home screen once you’re signed in.'] },
    {
      title: 'Turn on Voice alerts',
      body: ['Tap the bell (', b('Voice alerts'), ') at the top of the Operations Center — on a phone it’s just the bell icon. Your browser needs one click before it can speak.'],
    },
    passkey(false),
  ];
  const watch = (chapters: FilmChapter[]): Rich => {
    const out: Rich = ['Start with '];
    chapters.forEach((c, i) => {
      if (i > 0) out.push(i === chapters.length - 1 ? ' and ' : ', ');
      out.push(a(`“${c.title}”`, chapterUrl(F.howItWorks, c)));
    });
    out.push(' in ', b(F.howItWorks.title), '.');
    return out;
  };

  if (o.role === 'officer') {
    return [...staff, { title: 'Watch the officer chapters', body: watch([ch.opsCenter, ch.triage, ch.spokenAlerts]) }];
  }
  return [
    ...staff,
    {
      title: 'Review Team and Access',
      body: ['Under ', b('Administration'), ': who’s on the team, pending invites, access codes, and whether sign-up is open or invite-only.'],
    },
    { title: 'Watch the films', body: watch([ch.team, ch.opsCenter, ch.triage]) },
  ];
}

function safetyFor(role: Role): Line[] {
  const notNineOneOne: Line = {
    icon: '🚨',
    lead: 'This dashboard is not 911.',
    body: [role === 'business' ? 'In danger? Call 911 first — then report here when you’re safe.' : 'In danger? Call 911 first.'],
  };
  if (role === 'business') {
    return [
      notNineOneOne,
      {
        icon: '🔒',
        lead: 'Your privacy.',
        body: ['Photos and your contact details go to officers only. When you share a report with nearby businesses, they see its category, location and description.'],
      },
      { icon: '✋', lead: 'Never approach.', body: ['Observe and report; don’t follow or confront anyone.'] },
    ];
  }
  const lines: Line[] = [
    notNineOneOne,
    {
      icon: '🔒',
      lead: 'Keep this link private.',
      body: ['Officers see every report, including officers-only reports, photos, internal notes and reporters’ contact details. Please don’t forward this email.'],
    },
  ];
  if (role === 'admin') {
    lines.push({
      icon: '🔑',
      lead: 'You decide who gets in.',
      body: ['Add a passkey to your account, and never share sign-in links or access codes meant for someone else.'],
    });
  }
  return lines;
}

function helpFor(o: InvitationOptions, who: string | null): Rich {
  if (o.source === 'code') return ['Questions? Ask whoever gave you the access code, or anyone on the Downtown safety team.'];
  if (who) return ['Questions? Ask ', who, ' or any administrator on the Downtown safety team.'];
  return ['Questions? Ask an administrator on the Downtown safety team.'];
}

function content(o: InvitationOptions): Content {
  const r = ROLE_COPY[o.role];
  const who = o.inviterName?.trim() || null;
  const site = (o.site || siteUrl() || FILM_SITE).replace(/\/$/, '');
  const login = `${site}/login`;
  const isNew = o.account === 'new';
  const button = isNew ? (o.source === 'admin' ? 'Accept your invitation' : 'Finish joining') : 'Sign in to the dashboard';

  const groups: Group[] =
    o.role === 'business'
      ? [{ items: BUSINESS_FEATURES(`${site}/live`) }]
      : o.role === 'officer'
        ? [{ items: OFFICER_FEATURES }]
        : [
            { title: 'Everything a Public Safety officer can do', items: ADMIN_OFFICER_FEATURES },
            { title: 'Plus, under Administration', items: ADMIN_FEATURES },
          ];

  return {
    subject: subjectFor(o),
    preheader: PREHEADER[o.role],
    eyebrow: eyebrowFor(o),
    heading: headingFor(o),
    intro: [
      openingFor(o, who),
      [
        'It’s ',
        b('a self-regulated safety dashboard'),
        ' for the core of Downtown Memphis: Downtown businesses report what they see, Downtown public-safety officers respond, and the block stays in the loop.',
      ],
    ],
    button,
    buttonNote: isNew
      ? ['No password needed — this button sets up your account for ', b(o.email), ' and signs you in.']
      : ['No password needed — this button signs you in as ', b(o.email), '.'],
    canDoTitle: `What you can do as ${r.a}`,
    canDoLead: [ROLE_LEAD[o.role]],
    groups,
    steps: stepsFor(o, button),
    films: filmsFor(o.role),
    safety: safetyFor(o.role),
    signIn: [
      [b('No password, ever.'), ' The button in this email is a one-time sign-in link for ', b(o.email), '.'],
      [
        'Later, sign in at ',
        a(display(login), login),
        ' with the same email — we’ll send you a fresh link — or with a passkey (Face ID, Touch ID or your device PIN) once you’ve added one.',
      ],
    ],
    help: helpFor(o, who),
    footer: [
      [
        '🔒 For your security, this link expires in 60 minutes and can be used once. If it has expired, sign in at ',
        a(display(login), login),
        ' with this email address for a new one.',
      ],
      [`If you weren’t expecting this ${isNew ? 'invitation' : 'email'}, you can safely ignore it.`],
      [isNew ? 'This invitation is for ' : 'This email is for ', o.email, '.'],
    ],
  };
}

/** "https://www.901safety.com/login" → "www.901safety.com/login" */
function display(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

// ── HTML ─────────────────────────────────────────────────────────────────────
// Tables and inline styles for Gmail, Outlook and Apple Mail. The <style>
// blocks only refine: narrow screens, dark mode where the client supports it,
// and Outlook.com / Apple Mail quirks — kept apart because some clients drop a
// whole block over one selector they don't support.

const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const C = {
  navy: '#1B2A4A',
  navyDark: '#111A33',
  gold: '#C5A55A',
  goldText: '#7A5C14',
  ink: '#1a1a1a',
  text: '#374151',
  muted: '#6b7280',
  bg: '#f4f4f1',
  card: '#ffffff',
  border: '#e5e5e0',
  navySoft: '#eef1f7',
  warnBg: '#fef2f2',
  warnLine: '#dc2626',
  warnText: '#7f1d1d',
};

const STYLES = `<style>
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:separate;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
@media only screen and (max-width:620px){
.wrap{padding:16px 8px!important;}
.px{padding-left:20px!important;padding-right:20px!important;}
.h1{font-size:24px!important;line-height:30px!important;}
.btnw{width:100%!important;}
.btna{display:block!important;}
.thumbc{width:96px!important;padding-right:12px!important;}
.thumbc img{width:96px!important;}
.tile{width:96px!important;}
.tileh{height:54px!important;}
}
</style>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme:dark){
.bg{background:#0d1424!important;}
.card{background:#151f36!important;border-color:#26324d!important;}
.ink{color:#f1f3f8!important;}
.txt{color:#d5dae5!important;}
.mut{color:#aab3c5!important;}
.lnk{color:#e2c77f!important;}
.eyb{color:#e2c77f!important;}
.rule{background:#26324d!important;}
.soft{background:#1b2742!important;border-color:#2b3a5c!important;}
.film{background:#18233d!important;border-color:#2b3a5c!important;}
.warn{background:#2a1618!important;border-color:#f87171!important;}
.warnt{color:#fecaca!important;}
.btn{background:#c5a55a!important;}
.btnt{color:#111a33!important;}
.num{background:#c5a55a!important;color:#111a33!important;}
}
</style>
<style>
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
[data-ogsb] .bg{background:#0d1424!important;}
[data-ogsb] .card{background:#151f36!important;}
[data-ogsc] .ink{color:#f1f3f8!important;}
[data-ogsc] .txt{color:#d5dae5!important;}
[data-ogsc] .mut{color:#aab3c5!important;}
[data-ogsc] .lnk,[data-ogsc] .eyb{color:#e2c77f!important;}
</style>`;

function esc(s: string): string {
  return escapeHtml(s);
}

/** Attribute values (URLs): escape & too. */
function attr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function richHtml(r: Rich, strong = `color:${C.ink};`): string {
  return r
    .map((s) => {
      if (typeof s === 'string') return esc(s);
      if ('b' in s) return `<strong class="ink" style="${strong}font-weight:700;">${esc(s.b)}</strong>`;
      return `<a class="lnk" href="${attr(s.href)}" target="_blank" style="color:${C.navy};text-decoration:underline;">${esc(s.text)}</a>`;
    })
    .join('');
}

/** A full-width row of the white card. */
function cardRow(inner: string, pad = '0 32px 28px'): string {
  return `<tr><td class="card px" style="background:${C.card};border-left:1px solid ${C.border};border-right:1px solid ${C.border};padding:${pad};">${inner}</td></tr>`;
}

function rule(): string {
  return cardRow(
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="height:1px;line-height:1px;font-size:0;background:${C.border};">&nbsp;</td></tr></table>`,
    '0 32px 26px',
  );
}

function h2(text: string): string {
  return `<h2 class="ink" style="margin:0 0 14px;${FONT}font-size:18px;line-height:24px;font-weight:700;color:${C.navy};">${esc(text)}</h2>`;
}

function para(r: Rich, extra = ''): string {
  return `<p class="txt" style="margin:0 0 14px;${FONT}font-size:15px;line-height:23px;color:${C.text};${extra}">${richHtml(r)}</p>`;
}

function itemRows(items: Item[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items
    .map(
      (it) =>
        `<tr><td width="34" valign="top" style="width:34px;padding:1px 0 14px;font-size:18px;line-height:22px;">${it.icon}</td>` +
        `<td valign="top" class="txt" style="padding:0 0 14px;${FONT}font-size:15px;line-height:22px;color:${C.text};">` +
        `<strong class="ink" style="color:${C.ink};font-weight:700;">${esc(it.label)}</strong> — ${richHtml(it.body)}</td></tr>`,
    )
    .join('')}</table>`;
}

function stepRows(steps: Step[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps
    .map(
      (s, i) =>
        `<tr><td width="40" valign="top" style="width:40px;padding:0 0 16px;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="num" align="center" valign="middle" width="26" height="26" style="width:26px;height:26px;border-radius:13px;background:${C.navy};color:#ffffff;${FONT}font-size:13px;font-weight:700;line-height:26px;text-align:center;">${i + 1}</td></tr></table></td>` +
        `<td valign="top" class="txt" style="padding:2px 0 16px;${FONT}font-size:15px;line-height:22px;color:${C.text};">` +
        `<strong class="ink" style="color:${C.ink};font-weight:700;">${esc(s.title)}.</strong> ${richHtml(s.body)}</td></tr>`,
    )
    .join('')}</table>`;
}

function filmCard(p: FilmPick): string {
  const f = p.film;
  const thumb = f.poster
    ? `<a href="${attr(f.url)}" target="_blank" style="text-decoration:none;"><img src="${attr(f.poster.src)}" width="132" alt="${attr(f.poster.alt)}" style="display:block;width:132px;max-width:100%;height:auto;border:0;border-radius:8px;background:${C.navy};color:#ffffff;${FONT}font-size:12px;line-height:16px;"></a>`
    : `<table role="presentation" class="tile" width="132" cellpadding="0" cellspacing="0" border="0" style="width:132px;"><tr><td class="tileh" align="center" valign="middle" height="74" bgcolor="${C.navy}" style="height:74px;border-radius:8px;background:${C.navy};${FONT}"><a href="${attr(f.url)}" target="_blank" aria-label="${attr(`Watch “${f.title}”`)}" style="color:${C.gold};font-size:22px;line-height:22px;text-decoration:none;">&#9654;&#xFE0E;</a></td></tr></table>`;
  const chapters = p.chapters.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;">` +
      `<tr><td colspan="2" class="mut" style="padding:0 0 4px;${FONT}font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};">Jump to a chapter</td></tr>` +
      p.chapters
        .map(
          (c) =>
            `<tr><td width="44" valign="top" class="mut" style="width:44px;padding:3px 0;${FONT}font-size:13px;line-height:20px;color:${C.muted};">${clock(c.start)}</td>` +
            `<td valign="top" style="padding:3px 0;${FONT}font-size:14px;line-height:20px;"><a class="lnk" href="${attr(chapterUrl(f, c))}" target="_blank" style="color:${C.navy};text-decoration:underline;">${esc(c.title)}</a></td></tr>`,
        )
        .join('') +
      `</table>`
    : '';
  return (
    `<table role="presentation" class="film" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.border};border-radius:12px;background:#ffffff;">` +
    `<tr><td style="padding:14px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td class="thumbc" width="132" valign="middle" style="width:132px;padding-right:14px;">${thumb}</td>` +
    `<td valign="middle" style="${FONT}">` +
    `<a class="ink" href="${attr(f.url)}" target="_blank" style="${FONT}font-size:16px;line-height:21px;font-weight:700;color:${C.navy};text-decoration:none;">${esc(f.title)}</a>` +
    `<div class="mut" style="margin-top:4px;${FONT}font-size:13px;line-height:18px;color:${C.muted};">Film · ${esc(f.length)}</div>` +
    `</td></tr></table>` +
    `<div class="txt" style="margin-top:12px;${FONT}font-size:14px;line-height:21px;color:${C.text};">${p.note ? `${richHtml(p.note)} ` : ''}${esc(f.summary)}</div>` +
    chapters +
    `<div style="margin-top:12px;${FONT}font-size:14px;line-height:20px;"><a class="lnk" href="${attr(f.url)}" target="_blank" style="color:${C.navy};font-weight:700;text-decoration:underline;">Watch “${esc(f.title)}”&nbsp;→</a></div>` +
    `</td></tr></table>`
  );
}

function button(label: string, url: string): string {
  return (
    `<table role="presentation" class="btnw" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:6px auto 0;">` +
    `<tr><td class="btn" align="center" bgcolor="${C.navy}" style="border-radius:12px;background:${C.navy};mso-padding-alt:15px 36px;">` +
    `<a class="btn btnt btna" href="${attr(url)}" target="_blank" style="display:inline-block;padding:15px 36px;${FONT}font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;background:${C.navy};">${esc(label)}</a>` +
    `</td></tr></table>`
  );
}

function renderHtml(c: Content, o: InvitationOptions): string {
  const preheaderPad = '&#8199;&#65279;&#847; '.repeat(40);
  const header =
    `<tr><td bgcolor="${C.navy}" style="background:${C.navy};border-radius:16px 16px 0 0;padding:24px 32px;" class="px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:12px;"><div style="width:40px;height:40px;background:${C.navyDark};border:1px solid #6b5f3f;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🛡️</div></td>` +
    `<td style="vertical-align:middle;"><div style="${FONT}color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.2px;">Core Downtown Memphis</div>` +
    `<div style="${FONT}color:${C.gold};font-size:11px;font-weight:600;letter-spacing:0.32em;">SAFETY DASHBOARD</div></td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="height:4px;background:${C.gold};font-size:0;line-height:0;">&nbsp;</td></tr>`;

  const hero = cardRow(
    `<p class="eyb" style="margin:0 0 10px;${FONT}font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C.goldText};">${esc(c.eyebrow)}</p>` +
      `<h1 class="ink h1" style="margin:0 0 16px;${FONT}font-size:26px;line-height:32px;font-weight:700;color:${C.ink};">${esc(c.heading)}</h1>` +
      c.intro.map((p) => para(p)).join('') +
      button(c.button, o.url) +
      `<p class="mut" style="margin:14px 0 0;${FONT}font-size:13px;line-height:20px;text-align:center;color:${C.muted};">${richHtml(c.buttonNote, `color:${C.text};`)}</p>`,
    '32px 32px 30px',
  );

  const canDo = cardRow(
    h2(c.canDoTitle) +
      para(c.canDoLead) +
      c.groups
        .map(
          (g) =>
            (g.title
              ? `<p class="mut" style="margin:6px 0 10px;${FONT}font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${esc(g.title)}</p>`
              : '') + itemRows(g.items),
        )
        .join(''),
    '0 32px 14px',
  );

  const steps = cardRow(h2('Your first steps') + stepRows(c.steps), '0 32px 12px');

  const films = cardRow(
    h2('Watch the films') +
      para(['Three short films show how it all works. Chapter links jump straight to the part you need.']) +
      c.films.map((p) => filmCard(p)).join(`<div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>`),
    '0 32px 28px',
  );

  const [urgent, ...care] = c.safety;
  const safety = cardRow(
    h2('Safety and privacy') +
      `<table role="presentation" class="warn" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.warnBg};border-left:4px solid ${C.warnLine};border-radius:8px;"><tr><td style="padding:14px 16px;">` +
      `<p class="warnt" style="margin:0;${FONT}font-size:15px;line-height:22px;color:${C.warnText};">${urgent.icon} <strong style="font-weight:700;">${esc(urgent.lead)}</strong> ${richHtml(urgent.body, '')}</p>` +
      `</td></tr></table>` +
      `<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>` +
      itemRows(care.map((l) => ({ icon: l.icon, label: l.lead.replace(/\.$/, ''), body: l.body }))),
    '0 32px 14px',
  );

  const signIn = cardRow(
    h2('How sign-in works') +
      `<table role="presentation" class="soft" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.navySoft};border-radius:8px;"><tr><td style="padding:14px 16px 2px;">` +
      c.signIn.map((p) => para(p, 'font-size:14px;line-height:21px;margin:0 0 12px;')).join('') +
      `</td></tr></table>`,
    '0 32px 26px',
  );

  const help = cardRow(para(c.help, 'margin:0;'), '0 32px 26px');

  const fallback = cardRow(
    `<p class="mut" style="margin:0 0 6px;${FONT}font-size:12px;line-height:18px;color:${C.muted};">If the button doesn’t work, copy and paste this link:</p>` +
      `<p style="margin:0;font-family:'Courier New',monospace;font-size:12px;line-height:18px;word-break:break-all;"><a class="lnk" href="${attr(o.url)}" target="_blank" style="color:${C.navy};">${esc(o.url)}</a></p>`,
    '0 32px 26px',
  );

  const footer =
    `<tr><td class="card px" style="background:${C.card};border:1px solid ${C.border};border-top:none;border-radius:0 0 16px 16px;padding:0 32px 26px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="height:1px;line-height:1px;font-size:0;background:${C.border};">&nbsp;</td></tr></table>` +
    c.footer
      .map(
        (p, i) =>
          `<p class="mut" style="margin:${i === 0 ? '20px' : '8px'} 0 0;${FONT}font-size:12px;line-height:18px;color:${C.muted};">${richHtml(p, `color:${C.muted};`)}</p>`,
      )
      .join('') +
    `<p class="mut" style="margin:12px 0 0;${FONT}font-size:11px;line-height:16px;color:#9ca3af;">${esc(BRAND)} · Memphis, TN</p>` +
    `</td></tr>`;

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(c.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${STYLES}
</head>
<body class="bg" style="margin:0;padding:0;background:${C.bg};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg};">${esc(c.preheader)}${preheaderPad}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
<tr><td class="wrap" align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
${header}
${hero}
${rule()}
${canDo}
${rule()}
${steps}
${rule()}
${films}
${safety}
${signIn}
${help}
${fallback}
${footer}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

// ── Plain text ───────────────────────────────────────────────────────────────

function richText(r: Rich): string {
  return r
    .map((s) => {
      if (typeof s === 'string') return s;
      if ('b' in s) return s.b;
      const shown = s.text.replace(/^https?:\/\//, '');
      return shown === display(s.href) ? s.href : `${s.text} (${s.href})`;
    })
    .join('');
}

function renderText(c: Content, o: InvitationOptions): string {
  const out: string[] = [];
  const section = (title: string) => out.push('', title.toUpperCase(), '');
  out.push(c.eyebrow, '', c.heading, '');
  c.intro.forEach((p) => out.push(richText(p), ''));
  out.push(`${c.button}:`, o.url, '', richText(c.buttonNote));

  section(c.canDoTitle);
  out.push(richText(c.canDoLead), '');
  c.groups.forEach((g) => {
    if (g.title) out.push(`${g.title}:`);
    g.items.forEach((it) => out.push(`- ${it.label} — ${richText(it.body)}`));
    out.push('');
  });
  out.pop();

  section('Your first steps');
  c.steps.forEach((s, i) => out.push(`${i + 1}. ${s.title}. ${richText(s.body)}`));

  section('Watch the films');
  c.films.forEach((p, i) => {
    const f = p.film;
    out.push(`${i + 1}. ${f.title} (${f.length})`, `   ${f.url}`, `   ${p.note ? `${richText(p.note)} ` : ''}${f.summary}`);
    p.chapters.forEach((ch) => out.push(`   - ${ch.title} (${clock(ch.start)}): ${chapterUrl(f, ch)}`));
    out.push('');
  });
  out.pop();

  section('Safety and privacy');
  c.safety.forEach((l) => out.push(`- ${l.lead} ${richText(l.body)}`));

  section('How sign-in works');
  c.signIn.forEach((p) => out.push(richText(p)));

  out.push('', richText(c.help), '', '--');
  c.footer.forEach((p) => out.push(richText(p).replace(/^🔒 /, '')));
  out.push(`${BRAND} · Memphis, TN`);
  // The HTML's button is a plain link here.
  return out
    .join('\n')
    .replace(/this button/g, 'this link')
    .replace(/Tap the button above\./g, 'Open the link above.')
    .replace(/The button in this email is/g, 'The link at the top of this email is');
}

// ── Public API ───────────────────────────────────────────────────────────────

/** The invitation email for a role and the way they're joining. */
export function invitationEmail(o: InvitationOptions): BrandedEmail {
  const c = content(o);
  return { subject: c.subject, html: renderHtml(c, o), text: renderText(c, o) };
}
