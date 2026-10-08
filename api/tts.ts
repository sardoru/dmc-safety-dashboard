import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from './_lib/auth.js';
import { methodNotAllowed, readBody, sendError, sendJson } from './_lib/http.js';
import { elevenConfig, listVoices, synthesize, TtsError } from './_lib/elevenlabs.js';

/**
 * ElevenLabs Eleven v4 speech for the dashboard (alerts, briefings, read-back,
 * the guided report's voice prompts).
 *
 *   GET  /api/tts  → { configured, model, defaultVoiceId, voices, voiceSource }
 *   POST /api/tts  { text, voiceId? } → audio/mpeg (streamed)
 *
 * The API key never leaves the server; every call needs a signed-in user.
 */
const MAX_CHARS = 2400;
const VOICE_ID = /^[A-Za-z0-9]{8,64}$/;

// Best-effort per-instance limiter so one tab can't burn the character quota.
const WINDOW_MS = 5 * 60_000;
const MAX_REQUESTS = 40;
const hits = new Map<string, number[]>();
function limited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > MAX_REQUESTS;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const guard = await requireRole(req, ['business', 'officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const cfg = elevenConfig();

  if (req.method === 'GET') {
    const { voices, source } = await listVoices();
    return sendJson(res, 200, {
      configured: Boolean(cfg.apiKey),
      model: cfg.model,
      fallbackModel: cfg.fallbackModel,
      defaultVoiceId: cfg.voiceId,
      voices,
      voiceSource: source,
    });
  }

  const body = readBody<{ text?: unknown; voiceId?: unknown }>(req);
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return sendError(res, 400, 'Text is required');
  if (text.length > MAX_CHARS) return sendError(res, 413, `Text is limited to ${MAX_CHARS} characters`);
  const voiceId =
    typeof body.voiceId === 'string' && VOICE_ID.test(body.voiceId) ? body.voiceId : cfg.voiceId;

  if (limited(guard.user.id)) return sendError(res, 429, 'Too many speech requests — try again shortly');

  try {
    const { response, attempt } = await synthesize(text, voiceId);
    res.status(200);
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-TTS-Model', attempt.model);
    res.setHeader('X-TTS-Route', attempt.route);

    const reader = response.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (err instanceof TtsError) return sendError(res, err.status, err.message);
    return sendError(res, 502, err instanceof Error ? err.message : 'Speech synthesis failed');
  }
}
