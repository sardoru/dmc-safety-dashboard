/** Access codes, waitlist and audit log — types, row mapping and demo samples. */
import { plural } from '../../lib/format';

export type CodeRole = 'business' | 'officer';
export type CodeStatus = 'active' | 'full' | 'expired' | 'revoked';

export interface Redemption {
  id: string;
  email: string;
  outcome: 'invited' | 'upgraded' | 'existing';
  joined: boolean;
  createdAt: number;
}

export interface AccessCode {
  id: string;
  code: string;
  label: string;
  role: CodeRole;
  maxUses: number;
  uses: number;
  expiresAt: number | null;
  revokedAt: number | null;
  createdAt: number;
  redemptions: Redemption[];
}

export interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  organization: string;
  note: string;
  createdAt: number;
}

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  meta: Record<string, unknown>;
  createdAt: number;
}

export interface CodeRow {
  id: string;
  code: string;
  label: string;
  role: CodeRole;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  access_code_redemptions?: { id: string; email: string; outcome: Redemption['outcome']; user_id: string | null; created_at: string }[];
}

const ms = (s: string | null) => (s ? new Date(s).getTime() : null);

export function rowToCode(r: CodeRow): AccessCode {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    role: r.role,
    maxUses: r.max_uses,
    uses: r.uses,
    expiresAt: ms(r.expires_at),
    revokedAt: ms(r.revoked_at),
    createdAt: ms(r.created_at) ?? Date.now(),
    redemptions: (r.access_code_redemptions ?? [])
      .map((x) => ({
        id: x.id,
        email: x.email,
        outcome: x.outcome,
        joined: Boolean(x.user_id),
        createdAt: ms(x.created_at) ?? 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt),
  };
}

export function codeStatus(c: AccessCode, now: number): CodeStatus {
  if (c.revokedAt) return 'revoked';
  if (c.expiresAt !== null && c.expiresAt <= now) return 'expired';
  if (c.uses >= c.maxUses) return 'full';
  return 'active';
}

export const STATUS_LABEL: Record<CodeStatus, string> = {
  active: 'Active',
  full: 'All seats used',
  expired: 'Expired',
  revoked: 'Revoked',
};

/** The link (and QR target) that pre-fills a code on /join. */
export function joinLink(code: string): string {
  return `${window.location.origin}/join?code=${encodeURIComponent(code)}`;
}

const ACTION_TEXT: Record<string, string> = {
  'code.created': 'created access code',
  'code.revoked': 'revoked access code',
  'code.redeemed': 'used access code',
  'invite.sent': 'sent an invitation to',
  'invite.revoked': 'revoked the invitation for',
  'member.role_granted': 'granted a role to',
  'member.role_changed': 'changed the role of',
  'waitlist.approved': 'approved the request from',
  'waitlist.dismissed': 'dismissed the request from',
  'passkey.removed': 'removed a passkey of',
  'passkey.setup_link': 'sent a passkey setup link to',
  'settings.changed': 'changed site settings',
  'queue.added': 'queued invitations',
  'queue.paused': 'paused the invitation queue',
  'queue.resumed': 'resumed the invitation queue',
  'queue.cancelled': 'cancelled queued invitations',
};

const SETTING_TEXT: Record<string, string> = {
  signup_mode: 'sign-up',
  public_map_enabled: 'public map',
  public_map_delay_minutes: 'public map delay (min)',
};

/** "Sgt. R. Delgado changed the role of dana@… — business → officer" */
export function describeAudit(e: AuditEntry): { verb: string; target: string | null; detail: string | null } {
  const verb = ACTION_TEXT[e.action] ?? e.action;
  const m = e.meta;
  let detail: string | null = null;
  switch (e.action) {
    case 'code.created':
      detail = [m.label, m.role, typeof m.seats === 'number' && plural(m.seats, 'seat')].filter(Boolean).join(' · ');
      break;
    case 'code.redeemed':
      detail = [m.email, m.outcome === 'upgraded' ? `raised to ${m.role}` : m.outcome === 'existing' ? 'existing account' : 'new member'].filter(Boolean).join(' · ');
      break;
    case 'member.role_changed':
    case 'member.role_granted':
      detail = `${m.from ?? '—'} → ${m.to ?? '—'}`;
      break;
    case 'invite.sent':
    case 'waitlist.approved':
      detail = [typeof m.role === 'string' && `as ${m.role}`, m.via === 'queue' && 'from a list'].filter(Boolean).join(' · ');
      break;
    case 'queue.added':
      detail = [
        typeof m.added === 'number' && plural(m.added, 'address', 'addresses'),
        typeof m.role === 'string' && `as ${m.role}`,
        typeof m.skipped === 'number' && m.skipped > 0 && `${m.skipped} already waiting`,
        typeof m.alreadyInvited === 'number' && m.alreadyInvited > 0 && `${m.alreadyInvited} already invited, left out`,
        m.reinvite === true && 'invited again on purpose',
      ]
        .filter(Boolean)
        .join(' · ');
      break;
    case 'queue.paused':
    case 'queue.resumed':
      // The queue pauses itself when the email limit is reached (actor: System).
      detail = typeof m.reason === 'string' ? m.reason : typeof m.queued === 'number' ? `${m.queued} waiting` : null;
      break;
    case 'queue.cancelled':
      detail = typeof m.count === 'number' ? plural(m.count, 'invitation') : null;
      break;
    case 'passkey.removed':
      detail = typeof m.device === 'string' ? m.device : null;
      break;
    case 'settings.changed':
      detail = Object.entries(m)
        .map(([k, v]) => {
          const [from, to] = Array.isArray(v) ? v : [undefined, v];
          return `${SETTING_TEXT[k] ?? k}: ${String(from)} → ${String(to)}`;
        })
        .join(' · ');
      break;
  }
  return { verb, target: e.action === 'settings.changed' ? null : e.target, detail: detail || null };
}

// ── Demo samples ──────────────────────────────────────────────────────────────

export function demoCodes(now: number): AccessCode[] {
  return [
    {
      id: 'demo-code-1',
      code: 'K7QM-2XRT',
      label: 'Downtown business association · October meeting',
      role: 'business',
      maxUses: 25,
      uses: 3,
      expiresAt: now + 21 * 86_400_000,
      revokedAt: null,
      createdAt: now - 2 * 86_400_000,
      redemptions: [
        { id: 'r1', email: 'dana@riverbluff.example', outcome: 'invited', joined: true, createdAt: now - 26 * 3_600_000 },
        { id: 'r2', email: 'luis@ortegasmarket.example', outcome: 'invited', joined: true, createdAt: now - 20 * 3_600_000 },
        { id: 'r3', email: 'orders@frontstreetdeli.example', outcome: 'invited', joined: false, createdAt: now - 3 * 3_600_000 },
      ],
    },
    {
      id: 'demo-code-2',
      code: 'DTPS-9HNC',
      label: 'New officer — night shift',
      role: 'officer',
      maxUses: 1,
      uses: 0,
      expiresAt: now + 3 * 86_400_000,
      revokedAt: null,
      createdAt: now - 4 * 3_600_000,
      redemptions: [],
    },
  ];
}

export function demoWaitlist(now: number): WaitlistEntry[] {
  return [
    {
      id: 'demo-wl-1',
      email: 'hello@unionavecycles.example',
      name: 'Jordan Ellis',
      organization: 'Union Avenue Cycles',
      note: 'We had two break-ins on our block this month and would like to join.',
      createdAt: now - 5 * 3_600_000,
    },
  ];
}

export function demoAudit(now: number): AuditEntry[] {
  return [
    { id: 'a1', actor: 'System', action: 'code.redeemed', target: 'K7QM-2XRT', meta: { email: 'orders@frontstreetdeli.example', outcome: 'invited', role: 'business' }, createdAt: now - 3 * 3_600_000 },
    { id: 'a1q', actor: 'Sgt. R. Delgado', action: 'queue.added', target: 'Safety Meeting · Oct 8', meta: { added: 92, role: 'business', skipped: 0 }, createdAt: now - 3 * 3_600_000 - 5 * 60_000 },
    { id: 'a2', actor: 'Sgt. R. Delgado', action: 'code.created', target: 'DTPS-9HNC', meta: { label: 'New officer — night shift', role: 'officer', seats: 1 }, createdAt: now - 4 * 3_600_000 },
    { id: 'a3', actor: 'Sgt. R. Delgado', action: 'member.role_changed', target: 't.hayes@downtownsafety.example', meta: { from: 'business', to: 'officer' }, createdAt: now - 26 * 3_600_000 },
  ];
}
