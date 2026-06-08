import type { VercelRequest } from '@vercel/node';
import { getAdmin } from './supabaseAdmin.js';

export type Role = 'business' | 'officer' | 'admin';

export interface AuthedUser {
  id: string;
  email: string | null;
  role: Role;
}

export function getBearer(req: VercelRequest): string | null {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/** Resolve the calling user (and their role) from the Bearer access token. */
export async function getUser(req: VercelRequest): Promise<AuthedUser | null> {
  const token = getBearer(req);
  if (!token) return null;

  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: (profile?.role as Role) ?? 'business',
  };
}

export type RoleGuardResult =
  | { ok: true; user: AuthedUser }
  | { ok: false; status: number; error: string };

/** Require an authenticated user holding one of the allowed roles. */
export async function requireRole(req: VercelRequest, roles: Role[]): Promise<RoleGuardResult> {
  const user = await getUser(req);
  if (!user) return { ok: false, status: 401, error: 'Not authenticated' };
  if (!roles.includes(user.role)) return { ok: false, status: 403, error: 'Insufficient permissions' };
  return { ok: true, user };
}

/**
 * Mint a Supabase session for an existing user without a password — used after
 * a verified passkey assertion. Generates a one-time magic-link token, then
 * immediately consumes it to obtain access/refresh tokens.
 */
export async function mintSession(
  email: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const admin = getAdmin();
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message || 'Could not generate sign-in token');
  }
  const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  });
  if (verifyError || !verified.session) {
    throw new Error(verifyError?.message || 'Could not create session');
  }
  return {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
  };
}
