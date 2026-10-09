import type { VercelRequest } from '@vercel/node';
import crypto from 'node:crypto';

/**
 * Signed webhooks (Standard Webhooks / Svix — what Resend and Supabase send).
 * The signature covers the exact request bytes, so read the raw body before
 * touching req.body.
 */
export async function readRawBody(req: VercelRequest): Promise<string> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
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

/**
 * Verify a Standard Webhooks signature. Accepts the `svix-*` header names Resend
 * uses and the `webhook-*` names of the spec. Refuses anything older or newer
 * than five minutes (replays).
 */
export function verifyWebhookSignature(raw: string, headers: VercelRequest['headers'], secret: string): boolean {
  const pick = (name: string) => {
    const v = headers[`svix-${name}`] ?? headers[`webhook-${name}`];
    return typeof v === 'string' ? v : undefined;
  };
  const id = pick('id');
  const timestamp = pick('timestamp');
  const signatureHeader = pick('signature');
  if (!id || !timestamp || !signatureHeader) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > 5 * 60) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, ''), 'base64');
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  // A space-separated list of "v1,<signature>" entries.
  return signatureHeader
    .split(' ')
    .map((p) => (p.includes(',') ? p.split(',')[1] : p))
    .some((sig) => {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
}
