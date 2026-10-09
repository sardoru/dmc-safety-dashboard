import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedUser, Role } from './auth.js';

/** Canonical origin for links in emails (https://www.901safety.com in production). */
export function siteUrl(): string {
  return (process.env.SITE_URL || '').replace(/\/$/, '');
}

export function normalizeEmail(raw: unknown): string | null {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254 ? email : null;
}

/**
 * A one-tap sign-in link for an address: an invite link for a new address
 * (Supabase creates the account; the sign-up trigger claims the pending
 * invite and applies its role) or a magic link for an existing account.
 * `passkeySetup` lands the person on the passkey prompt after sign-in.
 */
export async function signInLink(
  admin: SupabaseClient,
  email: string,
  existing: boolean,
  opts: { passkeySetup?: boolean } = {},
): Promise<string> {
  const type = existing ? 'magiclink' : 'invite';
  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.hashed_token) throw new Error(error?.message || 'Could not create a sign-in link');
  const params = new URLSearchParams({ token_hash: data.properties.hashed_token, type });
  if (opts.passkeySetup) params.set('passkey', 'setup');
  return `${siteUrl()}/auth/callback?${params.toString()}`;
}

/** Server-side audit entry with the acting admin (triggers can't see them under the service role). */
export async function audit(
  admin: SupabaseClient,
  actor: AuthedUser | null,
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {},
): Promise<void> {
  let label = 'System';
  if (actor) {
    const { data } = await admin.from('profiles').select('display_name, email').eq('id', actor.id).maybeSingle();
    label = (data?.display_name as string | null)?.trim() || (data?.email as string | null) || actor.email || 'Admin';
  }
  const { error } = await admin
    .from('audit_log')
    .insert({ actor_id: actor?.id ?? null, actor_label: label, action, target, meta });
  if (error) console.warn('[audit] write failed', action, error.message);
}

/** Best-effort per-instance limiter: N hits per key per window. */
export function limiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return recent.length > max;
  };
}

export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || 'unknown';
}

/** Higher outranks lower. Invitations, access codes and approvals only ever raise a role. */
export const ROLE_RANK: Record<Role, number> = { business: 1, officer: 2, admin: 3 };

export function parseRole(value: unknown): Role | null {
  return value === 'business' || value === 'officer' || value === 'admin' ? value : null;
}

/** A role from the database; anything unexpected is treated as the least-privileged one. */
export function roleOf(value: unknown): Role {
  return parseRole(value) ?? 'business';
}

/** Where an address stands: its account, or — when it has none — its open invitation. */
export interface Standing {
  account: { id: string; role: Role } | null;
  pending: { id: string; role: Role } | null;
}

/** Read an address's standing. A failed lookup throws: nothing should be sent on a guess. */
export async function standingOf(admin: SupabaseClient, email: string): Promise<Standing> {
  const { data: p, error } = await admin.from('profiles').select('id, role').eq('email', email).maybeSingle();
  if (error) throw new Error(error.message);
  if (p) return { account: { id: String(p.id), role: roleOf(p.role) }, pending: null };
  const { data: inv, error: inviteError } = await admin
    .from('officer_invites')
    .select('id, role')
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();
  if (inviteError) throw new Error(inviteError.message);
  return { account: null, pending: inv ? { id: String(inv.id), role: roleOf(inv.role) } : null };
}

/** The outcome of granting a role: what they have now, and what changed. */
export interface Grant {
  /** The role they have — or get when they open the link — after the grant. */
  role: Role;
  /** Their account, when the address already has one. */
  accountId: string | null;
  /** The account's role before, when the grant raised it. */
  raisedFrom: Role | null;
}

/**
 * Give an address a role without ever lowering one: an account is raised to it
 * or keeps a higher role; an open invitation is raised or kept; otherwise a
 * pending invite is created (the sign-up trigger applies it). Every write is
 * checked — a failure throws before anyone is emailed.
 */
export async function grantRole(
  admin: SupabaseClient,
  email: string,
  role: Role,
  by: { source: 'admin' | 'waitlist'; invitedBy: string },
): Promise<Grant> {
  const { account, pending } = await standingOf(admin, email);
  if (account) {
    if (ROLE_RANK[role] <= ROLE_RANK[account.role]) return { role: account.role, accountId: account.id, raisedFrom: null };
    const { error } = await admin.from('profiles').update({ role }).eq('id', account.id);
    if (error) throw new Error(error.message);
    return { role, accountId: account.id, raisedFrom: account.role };
  }
  if (pending) {
    if (ROLE_RANK[role] <= ROLE_RANK[pending.role]) return { role: pending.role, accountId: null, raisedFrom: null };
    const { error } = await admin
      .from('officer_invites')
      .update({ role, source: by.source, invited_by: by.invitedBy })
      .eq('id', pending.id);
    if (error) throw new Error(error.message);
    return { role, accountId: null, raisedFrom: null };
  }
  const { error } = await admin
    .from('officer_invites')
    .insert({ email, role, status: 'pending', source: by.source, invited_by: by.invitedBy });
  if (error) throw new Error(error.message);
  return { role, accountId: null, raisedFrom: null };
}

/**
 * Has this account ever signed in? An account made by an invite link it never
 * opened hasn't — its email should still read as an invitation. Unknown (the
 * lookup failed) counts as yes.
 */
export async function hasSignedIn(admin: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return true;
    return Boolean(data.user.last_sign_in_at);
  } catch {
    return true;
  }
}

/**
 * Strict: has this account ever signed in? A failed lookup throws — the paced list (Invite a list)
 * skips people who already use the dashboard, and must never skip anyone on a guess.
 */
export async function signedInBefore(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error(error?.message || 'Could not look up the account');
  return Boolean(data.user.last_sign_in_at);
}

/**
 * The acting admin's name for "… invited you" lines, or null when they haven't
 * set one (the sign-up default is their email's local part, which reads badly).
 */
export async function inviterName(admin: SupabaseClient, actor: AuthedUser): Promise<string | null> {
  const { data } = await admin.from('profiles').select('display_name, email').eq('id', actor.id).maybeSingle();
  const name = String(data?.display_name ?? '')
    .replace(/[\p{Cc}\s]+/gu, ' ')
    .trim()
    .slice(0, 80);
  const local = String(data?.email ?? actor.email ?? '').split('@')[0].toLowerCase();
  return name && name.toLowerCase() !== local ? name : null;
}
