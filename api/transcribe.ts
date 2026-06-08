import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from './_lib/auth.js';
import { sendError, sendJson, methodNotAllowed, readBody } from './_lib/http.js';

/**
 * Tap-to-speak transcription. The client records a short clip and posts it as
 * base64 JSON; we forward it to OpenAI's transcription model and return text.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendError(res, 500, 'Transcription is not configured (missing OPENAI_API_KEY)');

  const { audio, mimeType } = readBody<{ audio?: string; mimeType?: string }>(req);
  if (!audio) return sendError(res, 400, 'Missing audio');

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  const type = mimeType || 'audio/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('mpeg') ? 'mp3' : 'webm';

  try {
    const bytes = Buffer.from(audio, 'base64');
    const blob = new Blob([bytes], { type });
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', model);

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    const data = await resp.json();
    if (!resp.ok) {
      return sendError(res, 502, data?.error?.message || `Transcription failed (${resp.status})`);
    }
    return sendJson(res, 200, { text: (data.text || '').trim() });
  } catch (err) {
    return sendError(res, 502, err instanceof Error ? err.message : 'Transcription failed');
  }
}
