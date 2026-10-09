import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { inviteByEmail } from '../_lib/invite.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../_lib/http.js';
import { inviterName, normalizeEmail, parseRole } from '../_lib/membership.js';

/**
 * Admin only — invite someone by email as a member business, a Public Safety officer or an
 * administrator:
 *
 *   POST { email, role: 'business' | 'officer' | 'admin' }
 *   → { status: 'invited' | 'granted' | 'unchanged', role, emailed }
 *
 * Never lowers anyone. A new address gets a pending invite — or its open one is raised (or kept, when
 * it's already higher) — and the invitation email for the role it carries (`invited`). An existing
 * account is raised right away (`granted`) or keeps an equal or higher role (`unchanged`); either way it
 * gets a sign-in link and the guide for the role it has. An account that has never signed in (its first
 * invite unopened) gets the invitation again (`invited`). Any failed write stops the request before an
 * email goes out. The steps live in `api/_lib/invite.ts`, shared with the paced list (Invite a list).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const body = readBody<{ email?: unknown; role?: unknown }>(req);
  const email = normalizeEmail(body.email);
  if (!email) return sendError(res, 400, 'A valid email is required');
  const role = parseRole(body.role);
  if (!role) return sendError(res, 400, 'Choose a role: business, officer or admin');

  const admin = getAdmin();

  try {
    const who = await inviterName(admin, guard.user);
    const result = await inviteByEmail(admin, email, role, { actor: guard.user, name: who });
    if (result.kind === 'no-link') return sendError(res, 502, result.error);
    // 'stopped' needs a beforeSend hook, which only the paced list passes.
    if (result.kind === 'stopped') return sendError(res, 500, 'Could not send invitation');
    return sendJson(res, 200, { status: result.status, role: result.role, emailed: result.emailed });
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Could not send invitation');
  }
}
