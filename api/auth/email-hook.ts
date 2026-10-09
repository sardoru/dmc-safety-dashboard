import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import type { Role } from '../_lib/auth.js';
import { brandedAuthEmail, sendEmail } from '../_lib/emails.js';
import { invitationEmail } from '../_lib/invitations.js';
import { sendError, sendJson } from '../_lib/http.js';
import { roleOf } from '../_lib/membership.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';

// Supabase delivers the raw request body; we must verify the signature over the
// exact bytes, so readRawBody() consumes the stream before touching req.body.

interface EmailHookPayload {
  user: { email: string };
  email_data: {
    token_hash: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendError(res, 405, 'Method not allowed');
  }

  const raw = await readRawBody(req);

  // Fail closed: without the secret anyone could make us send branded
  // sign-in emails that point wherever they like.
  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) return sendError(res, 503, 'Email hook is not configured');
  if (!verifyStandardWebhook(raw, req.headers, secret)) {
    return sendError(res, 401, 'Invalid webhook signature');
  }

  let payload: EmailHookPayload;
  try {
    payload = JSON.parse(raw) as EmailHookPayload;
  } catch {
    return sendError(res, 400, 'Invalid JSON payload');
  }

  const email = payload.user?.email;
  const data = payload.email_data;
  if (!email || !data?.token_hash) {
    return sendError(res, 400, 'Missing user email or token');
  }

  const site = (process.env.SITE_URL || data.site_url || '').replace(/\/$/, '');
  const base = data.redirect_to || `${site}/auth/callback`;
  const url = `${base}${base.includes('?') ? '&' : '?'}token_hash=${encodeURIComponent(
    data.token_hash,
  )}&type=${encodeURIComponent(data.email_action_type)}`;

  // Invitations Supabase sends itself (e.g. "Invite user" in its dashboard) get
  // the same role-specific email as ours; everything else is a sign-in email.
  const email_built =
    data.email_action_type === 'invite'
      ? invitationEmail({ role: await invitedRole(email), source: 'admin', account: 'new', email, url })
      : buildEmail(data.email_action_type, email, url);

  try {
    await sendEmail(email, email_built);
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Email send failed');
  }

  // 200 with empty body tells Supabase the email was handled.
  return sendJson(res, 200, {});
}

function buildEmail(actionType: string, email: string, url: string) {
  switch (actionType) {
    case 'recovery':
      return brandedAuthEmail({
        subject: 'Reset access to Core Downtown Memphis Safety Dashboard',
        heading: 'Reset your access',
        preview: 'Securely reset access to the Core Downtown Memphis Safety Dashboard.',
        intro: 'Use the button below to reset access to your Core Downtown Memphis Safety Dashboard account.',
        buttonLabel: 'Reset access',
        url,
      });
    case 'email_change':
      return brandedAuthEmail({
        subject: 'Confirm your new email · Core Downtown Memphis Safety',
        heading: 'Confirm your email change',
        preview: 'Confirm your new email for the Core Downtown Memphis Safety Dashboard.',
        intro: 'Confirm this address to finish updating the email on your Core Downtown Memphis Safety account.',
        buttonLabel: 'Confirm email',
        url,
      });
    case 'signup':
    case 'magiclink':
    case 'email':
    default:
      return brandedAuthEmail({
        subject: 'Your Core Downtown Memphis Safety sign-in link',
        heading: 'Sign in to Core Downtown Memphis Safety',
        preview: 'Your secure sign-in link for the Core Downtown Memphis Safety Dashboard.',
        intro:
          'Tap the button below to securely sign in to the Core Downtown Memphis Safety Dashboard. No password required.',
        buttonLabel: 'Sign in',
        url,
        footnote: `This link signs you in as ${email}.`,
      });
  }
}

/**
 * The role a Supabase-sent invitation carries: the address's open invite, or
 * the one the sign-up trigger claimed moments ago. Without one, a new account
 * is a member business — so is any lookup failure.
 */
async function invitedRole(email: string): Promise<Role> {
  try {
    const { data } = await getAdmin()
      .from('officer_invites')
      .select('role, status, claimed_at')
      .eq('email', email.toLowerCase())
      .in('status', ['pending', 'claimed'])
      .order('created_at', { ascending: false })
      .limit(5);
    const fresh = (data ?? []).find(
      (r) => r.status === 'pending' || (r.claimed_at && Date.now() - Date.parse(String(r.claimed_at)) < 10 * 60_000),
    );
    return roleOf(fresh?.role);
  } catch {
    return 'business';
  }
}

async function readRawBody(req: VercelRequest): Promise<string> {
  // Prefer the raw stream (correct for signature verification).
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
    }
    if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  } catch {
    /* fall through */
  }
  // Fallback if the platform already parsed the body.
  if (req.body) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return '';
}

function verifyStandardWebhook(
  raw: string,
  headers: VercelRequest['headers'],
  secret: string,
): boolean {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (
    typeof id !== 'string' ||
    typeof timestamp !== 'string' ||
    typeof signatureHeader !== 'string'
  ) {
    return false;
  }

  // Standard Webhooks: refuse replays outside a 5-minute window.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 5 * 60) return false;

  const base64Secret = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '');
  let key: Buffer;
  try {
    key = Buffer.from(base64Secret, 'base64');
  } catch {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${raw}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  // Header is a space-separated list of "v1,<signature>" entries.
  const provided = signatureHeader.split(' ').map((p) => (p.includes(',') ? p.split(',')[1] : p));
  return provided.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
