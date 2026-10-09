import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedUser } from './auth.js';

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

export async function accountExists(admin: SupabaseClient, email: string): Promise<boolean> {
  const { data } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  return Boolean(data);
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

export const ROLE_LABEL: Record<string, string> = {
  business: 'member business',
  officer: 'public-safety officer',
  admin: 'administrator',
};
