import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError, sendJson } from './_lib/http.js';
import { handleInbound, type InboundEvent } from './_lib/inbound.js';
import { readRawBody, verifyWebhookSignature } from './_lib/webhooks.js';

// Resend's "email.received" webhook: replies to the dashboard's emails are relayed through
// safety@901safety.com without showing the team's inbox (see api/_lib/inbound.ts).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return sendError(res, 503, 'Inbound email is not configured');

  const raw = await readRawBody(req);
  if (!verifyWebhookSignature(raw, req.headers, secret)) return sendError(res, 401, 'Bad signature');

  let evt: InboundEvent;
  try {
    evt = JSON.parse(raw) as InboundEvent;
  } catch {
    return sendError(res, 400, 'Bad payload');
  }
  try {
    const outcome = await handleInbound(evt);
    return sendJson(res, 200, outcome);
  } catch (e) {
    // A 5xx makes Resend retry the delivery later.
    console.error('[inbound-email]', e instanceof Error ? e.message : e);
    return sendError(res, 502, 'Could not relay this message right now');
  }
}
