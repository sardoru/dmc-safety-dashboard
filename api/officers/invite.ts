import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { brandedAuthEmail, sendEmail } from '../_lib/emails.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const body = readBody<{ email?: string; role?: string }>(req);
  const email = body.email?.trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'officer';
  if (!email || !/.+@.+\..+/.test(email)) return sendError(res, 400, 'A valid email is required');

  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  const admin = getAdmin();

  // Does this person already have an account?
  const { data: existing } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .maybeSingle();

  try {
    if (existing) {
      // Grant the role immediately and record the (already-claimed) invite.
      await admin.from('profiles').update({ role }).eq('id', existing.id);
      await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
      await admin.from('officer_invites').insert({
        email,
        role,
        status: 'claimed',
        invited_by: guard.user.id,
        claimed_at: new Date().toISOString(),
      });

      const { data: link, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (error || !link?.properties?.hashed_token) {
        return sendJson(res, 200, { status: 'granted', emailed: false });
      }
      const url = `${site}/auth/callback?token_hash=${encodeURIComponent(
        link.properties.hashed_token,
      )}&type=magiclink`;
      await sendEmail(
        email,
        brandedAuthEmail({
          subject: 'Your DMC Safety officer access is ready',
          heading: 'You’re now a DMC officer',
          preview: 'Officer access to the DMC Safety Dashboard has been granted.',
          intro: `You’ve been granted ${role === 'admin' ? 'administrator' : 'officer'} access to the DMC Safety Dashboard. Sign in to start filing reports.`,
          buttonLabel: 'Sign in',
          url,
          footnote: `Access granted for ${email}.`,
        }),
      );
      return sendJson(res, 200, { status: 'granted', emailed: true });
    }

    // New invitee: record pending invite, then create the user via an invite
    // link (the handle_new_user trigger claims the invite and sets the role).
    await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
    await admin.from('officer_invites').insert({
      email,
      role,
      status: 'pending',
      invited_by: guard.user.id,
    });

    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'invite', email });
    if (error || !link?.properties?.hashed_token) {
      return sendError(res, 502, error?.message || 'Could not generate invitation link');
    }
    const url = `${site}/auth/callback?token_hash=${encodeURIComponent(
      link.properties.hashed_token,
    )}&type=invite`;
    await sendEmail(
      email,
      brandedAuthEmail({
        subject: 'You’re invited to the DMC Safety Dashboard',
        heading: 'You’ve been invited',
        preview: 'Accept your DMC Safety officer invitation.',
        intro: `The Downtown Memphis Commission has invited you to join the Safety Dashboard as ${role === 'admin' ? 'an administrator' : 'a safety officer'}. Accept to set up your account.`,
        buttonLabel: 'Accept invitation',
        url,
        footnote: `This invitation is for ${email}.`,
      }),
    );
    return sendJson(res, 200, { status: 'invited', emailed: true });
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Could not send invitation');
  }
}
