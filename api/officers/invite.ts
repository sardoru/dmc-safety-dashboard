import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/emails.js';
import { invitationEmail, type InviteAccount } from '../_lib/invitations.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../_lib/http.js';
import { audit, grantRole, hasSignedIn, inviterName, normalizeEmail, parseRole, signInLink } from '../_lib/membership.js';

/**
 * Admin only — invite someone by email as a member business, a Public Safety
 * officer or an administrator:
 *
 *   POST { email, role: 'business' | 'officer' | 'admin' }
 *   → { status: 'invited' | 'granted' | 'unchanged', role, emailed }
 *
 * Never lowers anyone. A new address gets a pending invite — or its open one
 * is raised (or kept, when it's already higher) — and the invitation email for
 * the role it carries (`invited`). An existing account is raised right away
 * (`granted`) or keeps an equal or higher role (`unchanged`); either way it
 * gets a sign-in link and the guide for the role it has. An account that has
 * never signed in (its first invite unopened) gets the invitation again
 * (`invited`). Any failed write stops the request before an email goes out.
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
    const grant = await grantRole(admin, email, role, { source: 'admin', invitedBy: guard.user.id });

    if (grant.raisedFrom) {
      await audit(admin, guard.user, 'member.role_granted', email, { from: grant.raisedFrom, to: grant.role });
      // Record the (already-claimed) invite.
      const { error: clearError } = await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
      if (clearError) throw new Error(clearError.message);
      const { error: recordError } = await admin.from('officer_invites').insert({
        email,
        role: grant.role,
        status: 'claimed',
        invited_by: guard.user.id,
        claimed_at: new Date().toISOString(),
      });
      if (recordError) throw new Error(recordError.message);
    }

    const existing = grant.accountId !== null;
    const firstTime = grant.accountId === null || !(await hasSignedIn(admin, grant.accountId));
    const account: InviteAccount = firstTime ? 'new' : grant.raisedFrom ? 'raised' : 'existing';
    const status = firstTime ? 'invited' : grant.raisedFrom ? 'granted' : 'unchanged';

    let url: string;
    try {
      url = await signInLink(admin, email, existing);
    } catch (err) {
      if (existing) return sendJson(res, 200, { status, role: grant.role, emailed: false });
      return sendError(res, 502, err instanceof Error ? err.message : 'Could not generate invitation link');
    }
    await sendEmail(email, invitationEmail({ role: grant.role, source: 'admin', account, email, url, inviterName: who }));
    if (!grant.raisedFrom) {
      await audit(admin, guard.user, 'invite.sent', email, {
        role: grant.role,
        ...(existing ? { existing: true } : {}),
        ...(grant.role !== role ? { requested: role } : {}),
      });
    }
    return sendJson(res, 200, { status, role: grant.role, emailed: true });
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Could not send invitation');
  }
}
