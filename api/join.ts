import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdmin } from './_lib/supabaseAdmin.js';
import { sendEmail } from './_lib/emails.js';
import { invitationEmail, type InviteAccount } from './_lib/invitations.js';
import { methodNotAllowed, readBody, sendError, sendJson } from './_lib/http.js';
import { clientIp, hasSignedIn, limiter, normalizeEmail, roleOf, signInLink, standingOf } from './_lib/membership.js';

/**
 * Public membership entrance (no sign-in):
 *   POST { action: 'redeem',   code, email }                  → claim a seat, email a sign-in link
 *   POST { action: 'waitlist', email, name, organization, note } → ask to join
 * Neither answer says whether an address already has an account. `website`
 * is a honeypot: bots fill it, people never see it.
 */
const tooMany = limiter(8, 10 * 60_000);

const CODE_ERRORS: Record<string, string> = {
  invalid_code: 'That access code isn’t valid. Check it and try again.',
  revoked: 'That access code has been turned off. Ask whoever gave it to you for a new one.',
  expired: 'That access code has expired. Ask whoever gave it to you for a new one.',
  full: 'That access code has no seats left. Ask whoever gave it to you for a new one.',
  invalid_email: 'Enter a valid email address.',
};

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const body = readBody<Record<string, unknown>>(req);
  if (typeof body.website === 'string' && body.website.trim()) return sendJson(res, 200, { ok: true });

  const email = normalizeEmail(body.email);
  if (!email) return sendError(res, 400, CODE_ERRORS.invalid_email);
  if (tooMany(`${clientIp(req.headers)}|${email}`)) {
    return sendError(res, 429, 'Too many tries — wait a few minutes and try again.');
  }

  let admin: ReturnType<typeof getAdmin>;
  try {
    admin = getAdmin();
  } catch {
    return sendError(res, 503, 'Joining isn’t available on this deployment.');
  }

  if (body.action === 'redeem') {
    const code = clip(body.code, 40).toUpperCase();
    if (code.length < 6) return sendError(res, 400, CODE_ERRORS.invalid_code);

    const { data, error } = await admin.rpc('redeem_access_code', { p_code: code, p_email: email });
    if (error) return sendError(res, 502, 'Could not check that code right now — try again.');
    const r = data as { ok: boolean; error?: string; role?: string; outcome?: string; existing?: boolean; repeat?: boolean };
    if (!r?.ok) return sendError(res, 400, CODE_ERRORS[r?.error ?? ''] ?? CODE_ERRORS.invalid_code);

    try {
      // The email describes the role the address actually has now — not what
      // the code once did. A repeat redemption replays the first outcome, and
      // an admin may have changed the role since. A new address joins with its
      // open invite's role (the code raised it, or it was already higher).
      const { account: acct, pending } = await standingOf(admin, email);
      const role = acct?.role ?? pending?.role ?? roleOf(r.role);
      // An account that never signed in still gets the invitation copy.
      let account: InviteAccount = 'new';
      if (acct && (await hasSignedIn(admin, acct.id))) {
        account = !r.repeat && r.outcome === 'upgraded' ? 'raised' : 'existing';
      }
      const url = await signInLink(admin, email, Boolean(acct));
      await sendEmail(email, invitationEmail({ role, source: 'code', account, email, url, code }));
    } catch (err) {
      console.error('[join] email failed', err);
      return sendError(res, 502, 'Your seat is saved, but the email didn’t send — try again in a minute.');
    }
    return sendJson(res, 200, { ok: true, role: r.role });
  }

  if (body.action === 'waitlist') {
    const row = {
      email,
      name: clip(body.name, 120),
      organization: clip(body.organization, 160),
      note: clip(body.note, 1000),
    };
    // One open request per address; a repeat is quietly accepted.
    const { error } = await admin.from('waitlist').insert(row);
    if (error && error.code !== '23505') {
      console.error('[join] waitlist insert failed', error.message);
      return sendError(res, 502, 'Could not save your request — try again.');
    }
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 400, 'Unknown action');
}
