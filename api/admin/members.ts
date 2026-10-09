import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { brandedAuthEmail, sendEmail } from '../_lib/emails.js';
import { methodNotAllowed, readBody, sendError, sendJson } from '../_lib/http.js';
import { accountExists, audit, ROLE_LABEL, signInLink } from '../_lib/membership.js';
import { hashDisplayKey, newDisplayKey } from '../_lib/displays.js';

/**
 * Admin-only membership actions that need the service role or send email:
 *   { action: 'waitlist.approve', id, role }   → invite (or raise) and email them
 *   { action: 'passkeys.list',   userId }      → a member's passkeys
 *   { action: 'passkeys.remove', userId, passkeyId }
 *   { action: 'passkeys.setupLink', userId }   → email a one-tap passkey setup link
 *   { action: 'displays.list' }                → the wall displays' links (live ones)
 *   { action: 'displays.create', label }       → a new display link; its key is returned once
 *   { action: 'displays.revoke', id }          → stop a display link at once
 * Codes, settings and dismissals go through RLS-checked database calls instead.
 */
const RANK: Record<string, number> = { business: 1, officer: 2, admin: 3 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;
  const guard = await requireRole(req, ['admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);
  const actor = guard.user;
  const admin = getAdmin();
  const body = readBody<Record<string, unknown>>(req);

  try {
    switch (body.action) {
      case 'waitlist.approve': {
        const id = String(body.id ?? '');
        const role = body.role === 'officer' ? 'officer' : 'business';
        if (!UUID.test(id)) return sendError(res, 400, 'Missing request id');
        const { data: w } = await admin.from('waitlist').select('*').eq('id', id).maybeSingle();
        if (!w) return sendError(res, 404, 'That request no longer exists');
        if (w.status !== 'pending') return sendError(res, 409, 'That request was already handled');
        const email = String(w.email).toLowerCase();

        const existing = await accountExists(admin, email);
        if (existing) {
          const { data: p } = await admin.from('profiles').select('id, role').eq('email', email).maybeSingle();
          if (p && (RANK[role] ?? 0) > (RANK[p.role as string] ?? 0)) {
            await admin.from('profiles').update({ role }).eq('id', p.id);
          }
        } else {
          const { data: pending } = await admin
            .from('officer_invites')
            .select('id, role')
            .eq('status', 'pending')
            .eq('email', email)
            .maybeSingle();
          if (pending) {
            if ((RANK[role] ?? 0) > (RANK[pending.role as string] ?? 0)) {
              await admin.from('officer_invites').update({ role, source: 'waitlist' }).eq('id', pending.id);
            }
          } else {
            const { error } = await admin
              .from('officer_invites')
              .insert({ email, role, status: 'pending', source: 'waitlist', invited_by: actor.id });
            if (error) throw new Error(error.message);
          }
        }

        const url = await signInLink(admin, email, existing);
        await sendEmail(
          email,
          brandedAuthEmail({
            subject: 'You’re in — Core Downtown Memphis Safety Dashboard',
            heading: 'Your request is approved',
            preview: 'You can now join the Downtown safety network.',
            intro: `Thanks for asking to join. You’re approved as a ${ROLE_LABEL[role]}. Tap below to ${existing ? 'sign in' : 'finish joining'} — no password needed.`,
            buttonLabel: existing ? 'Sign in' : 'Finish joining',
            url,
            footnote: `This link is for ${email}.`,
          }),
        );
        await admin
          .from('waitlist')
          .update({ status: 'approved', role, decided_by: actor.id, decided_at: new Date().toISOString() })
          .eq('id', id);
        await audit(admin, actor, 'waitlist.approved', email, { role, name: w.name, organization: w.organization });
        return sendJson(res, 200, { ok: true });
      }

      case 'passkeys.list': {
        const userId = String(body.userId ?? '');
        if (!UUID.test(userId)) return sendError(res, 400, 'Missing member');
        const { data, error } = await admin
          .from('passkeys')
          .select('id, device_label, transports, created_at, last_used_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return sendJson(res, 200, { passkeys: data ?? [] });
      }

      case 'passkeys.remove': {
        const userId = String(body.userId ?? '');
        const passkeyId = String(body.passkeyId ?? '');
        if (!UUID.test(userId) || !UUID.test(passkeyId)) return sendError(res, 400, 'Missing passkey');
        const { data, error } = await admin
          .from('passkeys')
          .delete()
          .eq('id', passkeyId)
          .eq('user_id', userId)
          .select('device_label');
        if (error) throw new Error(error.message);
        if (!data?.length) return sendError(res, 404, 'That passkey is already gone');
        const { data: p } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
        await audit(admin, actor, 'passkey.removed', (p?.email as string) ?? userId, { device: data[0].device_label });
        return sendJson(res, 200, { ok: true });
      }

      case 'passkeys.setupLink': {
        const userId = String(body.userId ?? '');
        if (!UUID.test(userId)) return sendError(res, 400, 'Missing member');
        const { data: p } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
        const email = (p?.email as string | undefined)?.toLowerCase();
        if (!email) return sendError(res, 404, 'That member has no email address');
        const url = await signInLink(admin, email, true, { passkeySetup: true });
        await sendEmail(
          email,
          brandedAuthEmail({
            subject: 'Set up a passkey · Core Downtown Memphis Safety',
            heading: 'Add a passkey',
            preview: 'One tap to sign in, then add Face ID, Touch ID or your device PIN.',
            intro:
              'An administrator sent you this link so you can add a passkey. Open it on the phone or computer you use, sign in, and follow the prompt — next time you sign in with Face ID, Touch ID or your device PIN.',
            buttonLabel: 'Sign in and add a passkey',
            url,
            footnote: `This link signs you in as ${email}. It works once.`,
          }),
        );
        await audit(admin, actor, 'passkey.setup_link', email);
        return sendJson(res, 200, { ok: true });
      }

      case 'displays.list': {
        const { data, error } = await admin
          .from('display_links')
          .select('id, label, created_at, last_seen_at, revoked_at')
          .is('revoked_at', null)
          .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return sendJson(res, 200, { displays: data ?? [] });
      }

      case 'displays.create': {
        const label = String(body.label ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
        if (!label) return sendError(res, 400, 'Name the display — for example "Office wall"');
        const key = newDisplayKey();
        const { data, error } = await admin
          .from('display_links')
          .insert({ label, token_hash: hashDisplayKey(key), created_by: actor.id })
          .select('id, label, created_at, last_seen_at, revoked_at')
          .single();
        if (error) throw new Error(error.message);
        await audit(admin, actor, 'display.created', label);
        // The key leaves the server once, here, inside the link; only its hash is kept.
        return sendJson(res, 200, { display: data, key });
      }

      case 'displays.revoke': {
        const id = String(body.id ?? '');
        if (!UUID.test(id)) return sendError(res, 400, 'Missing display');
        const { data, error } = await admin
          .from('display_links')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', id)
          .is('revoked_at', null)
          .select('label');
        if (error) throw new Error(error.message);
        if (!data?.length) return sendError(res, 404, 'That display link is already revoked');
        await audit(admin, actor, 'display.revoked', data[0].label as string);
        return sendJson(res, 200, { ok: true });
      }

      default:
        return sendError(res, 400, 'Unknown action');
    }
  } catch (err) {
    console.error('[admin/members]', body.action, err);
    return sendError(res, 500, err instanceof Error ? err.message : 'Something went wrong');
  }
}
