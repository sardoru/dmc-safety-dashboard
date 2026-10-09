import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { methodNotAllowed, sendError, sendJson } from '../_lib/http.js';
import { QueueNotReady, runQueue } from '../_lib/inviteQueue.js';

/**
 * GET /api/cron/invites — Vercel Cron, every 15 minutes (vercel.json → crons): sends the next few
 * invitations from Invite a list (Admin → Team). Vercel calls it with `Authorization: Bearer
 * $CRON_SECRET`; anything else gets 401, and without CRON_SECRET it answers 503 (fails closed).
 *
 * Paused: nothing. Otherwise it recovers rows stuck while sending, claims up to the per-run count
 * (5 by default) and invites each like Admin → Team → Invite someone, about 600 ms apart.
 * Answers with counts only — never addresses.
 */
function bearerMatches(header: unknown, secret: string): boolean {
  const given = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!given) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(secret));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['GET'])) return;
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) return sendError(res, 503, 'CRON_SECRET is not set');
  if (!bearerMatches(req.headers.authorization, secret)) return sendError(res, 401, 'Not authorized');

  try {
    const summary = await runQueue(getAdmin());
    console.log('[cron/invites]', JSON.stringify(summary));
    return sendJson(res, 200, summary);
  } catch (err) {
    if (err instanceof QueueNotReady) return sendError(res, 503, err.message);
    console.error('[cron/invites]', err instanceof Error ? err.message : err);
    return sendError(res, 500, 'The invitation run failed');
  }
}
