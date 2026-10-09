import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdmin } from './_lib/supabaseAdmin.js';
import { methodNotAllowed, sendError, sendJson } from './_lib/http.js';
import { clientIp, limiter } from './_lib/membership.js';
import { displayKeyFrom, findDisplay, touchDisplay, wallFeed } from './_lib/displays.js';

/**
 * GET /api/display — the feed for a wall display (/tv#key=…), sent with `X-Display-Key: <key>`.
 * The key is a display link an administrator made in Admin → Access; a revoked or unknown key gets 401.
 * Answers: { display: { label }, …WallFeed } — never reporter names, contact details, descriptions or photos.
 */
const tooMany = limiter(40, 60_000);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['GET'])) return;
  res.setHeader('Cache-Control', 'no-store');
  if (tooMany(clientIp(req.headers))) return sendError(res, 429, 'Too many requests — slow down');
  const key = displayKeyFrom(req.headers);
  if (!key) return sendError(res, 401, 'This display link is missing its key');
  try {
    const admin = getAdmin();
    const display = await findDisplay(admin, key);
    if (!display) return sendError(res, 401, 'This display link was revoked or never existed');
    const feed = await wallFeed(admin);
    await touchDisplay(admin, display).catch(() => {});
    return sendJson(res, 200, { display: { label: display.label }, ...feed });
  } catch (err) {
    console.error('[display]', err instanceof Error ? err.message : err);
    return sendError(res, 500, 'The display feed is unavailable right now');
  }
}
