import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { sendEmail } from '../_lib/emails.js';
import { invitationEmail } from '../_lib/invitations.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../_lib/http.js';
import { audit, inviterName, normalizeEmail, parseRole, ROLE_RANK, roleOf, signInLink } from '../_lib/membership.js';

/**
 * Admin only — invite someone by email as a member business, a Public Safety
 * officer or an administrator:
 *
 *   POST { email, role: 'business' | 'officer' | 'admin' }   (no role → officer)
 *   → { status: 'invited' | 'granted' | 'unchanged', role, emailed }
 *
 * A new address gets a pending invite (the sign-up trigger claims it and
 * applies the role) and the invitation email for that role. An existing
 * account is raised to the role right away (`granted`) — never lowered: one
 * that already has the role or a higher one keeps it (`unchanged`). Either way
 * they get a sign-in link with the guide for the role they now have.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const body = readBody<{ email?: unknown; role?: unknown }>(req);
  const email = normalizeEmail(body.email);
  if (!email) return sendError(res, 400, 'A valid email is required');
  const role = body.role === undefined || body.role === null || body.role === '' ? 'officer' : parseRole(body.role);
  if (!role) return sendError(res, 400, 'Choose a role: business, officer or admin');

  const admin = getAdmin();

  try {
    const who = await inviterName(admin, guard.user);

    // Does this person already have an account?
    const { data: existing, error: lookupError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('email', email)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    if (existing) {
      const current = roleOf(existing.role);
      const raised = ROLE_RANK[role] > ROLE_RANK[current];
      const kept = raised ? role : current;
      const status = raised ? 'granted' : 'unchanged';

      if (raised) {
        // Grant the role immediately and record the (already-claimed) invite.
        const { error } = await admin.from('profiles').update({ role }).eq('id', existing.id);
        if (error) throw new Error(error.message);
        await audit(admin, guard.user, 'member.role_granted', email, { from: current, to: role });
        await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
        await admin.from('officer_invites').insert({
          email,
          role,
          status: 'claimed',
          invited_by: guard.user.id,
          claimed_at: new Date().toISOString(),
        });
      } else {
        await audit(admin, guard.user, 'invite.sent', email, {
          role: kept,
          existing: true,
          ...(kept !== role ? { requested: role } : {}),
        });
      }

      let url: string;
      try {
        url = await signInLink(admin, email, true);
      } catch {
        return sendJson(res, 200, { status, role: kept, emailed: false });
      }
      await sendEmail(
        email,
        invitationEmail({ role: kept, source: 'admin', account: raised ? 'raised' : 'existing', email, url, inviterName: who }),
      );
      return sendJson(res, 200, { status, role: kept, emailed: true });
    }

    // New invitee: record the pending invite, then create the user via an
    // invite link (the handle_new_user trigger claims the invite and sets the role).
    await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
    const { error: inviteError } = await admin.from('officer_invites').insert({
      email,
      role,
      status: 'pending',
      invited_by: guard.user.id,
    });
    if (inviteError) throw new Error(inviteError.message);

    let url: string;
    try {
      url = await signInLink(admin, email, false);
    } catch (err) {
      return sendError(res, 502, err instanceof Error ? err.message : 'Could not generate invitation link');
    }
    await sendEmail(email, invitationEmail({ role, source: 'admin', account: 'new', email, url, inviterName: who }));
    await audit(admin, guard.user, 'invite.sent', email, { role });
    return sendJson(res, 200, { status: 'invited', role, emailed: true });
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Could not send invitation');
  }
}
