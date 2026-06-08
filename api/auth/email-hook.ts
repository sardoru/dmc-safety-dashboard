import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { brandedAuthEmail, sendEmail } from '../_lib/emails.js';
import { sendError, sendJson } from '../_lib/http.js';

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

  const secret = process.env.SEND_EMAIL_HOOK_SECRET;
  if (secret) {
    if (!verifyStandardWebhook(raw, req.headers, secret)) {
      return sendError(res, 401, 'Invalid webhook signature');
    }
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

  const email_built = buildEmail(data.email_action_type, email, url);

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
        subject: 'Reset access to DMC Safety Dashboard',
        heading: 'Reset your access',
        preview: 'Securely reset access to the DMC Safety Dashboard.',
        intro: 'Use the button below to reset access to your DMC Safety Dashboard account.',
        buttonLabel: 'Reset access',
        url,
      });
    case 'invite':
      return brandedAuthEmail({
        subject: 'You’re invited to the DMC Safety Dashboard',
        heading: 'You’ve been invited',
        preview: 'Accept your invitation to the DMC Safety Dashboard.',
        intro:
          'You’ve been invited to join the Downtown Memphis Commission Safety Dashboard. Accept your invitation to get started.',
        buttonLabel: 'Accept invitation',
        url,
        footnote: `This invitation is for ${email}.`,
      });
    case 'email_change':
      return brandedAuthEmail({
        subject: 'Confirm your new email · DMC Safety',
        heading: 'Confirm your email change',
        preview: 'Confirm your new email for the DMC Safety Dashboard.',
        intro: 'Confirm this address to finish updating the email on your DMC Safety account.',
        buttonLabel: 'Confirm email',
        url,
      });
    case 'signup':
    case 'magiclink':
    case 'email':
    default:
      return brandedAuthEmail({
        subject: 'Your DMC Safety sign-in link',
        heading: 'Sign in to DMC Safety',
        preview: 'Your secure sign-in link for the DMC Safety Dashboard.',
        intro:
          'Tap the button below to securely sign in to the DMC Safety Dashboard. No password required.',
        buttonLabel: 'Sign in',
        url,
        footnote: `This link signs you in as ${email}.`,
      });
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
