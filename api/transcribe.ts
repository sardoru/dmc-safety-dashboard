import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from './_lib/auth.js';
import { fetchWithTimeout, isAbortError, sendError, sendJson, methodNotAllowed, readBody } from './_lib/http.js';

/**
 * Tap-to-speak transcription (dictation in the report form, officer quick
 * reports). The client records a short clip and posts it as base64 JSON; we
 * forward it to OpenAI's transcription model and return text.
 *
 * Vercel refuses request bodies over 4.5 MB before this runs, so the limit is
 * 3 MB of audio (≈4 MB as base64) — well past the recorder's time cap.
 */
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['business', 'officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendError(res, 503, 'Transcription is not configured (missing OPENAI_API_KEY)');

  const { audio, mimeType } = readBody<{ audio?: string; mimeType?: string }>(req);
  if (!audio) return sendError(res, 400, 'Missing audio');
  if (audio.length > (MAX_AUDIO_BYTES * 4) / 3) return sendError(res, 413, 'Recording is too long');

  const model = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
  const type = mimeType || 'audio/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('mpeg') ? 'mp3' : type.includes('ogg') ? 'ogg' : 'webm';

  try {
    const bytes = Buffer.from(audio, 'base64');
    const blob = new Blob([bytes], { type });
    const form = new FormData();
    form.append('file', blob, `audio.${ext}`);
    form.append('model', model);

    const resp = await fetchWithTimeout(
      'https://api.openai.com/v1/audio/transcriptions',
      { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form },
      25_000,
    );
    const data = await resp.json();
    if (!resp.ok) {
      return sendError(res, 502, data?.error?.message || `Transcription failed (${resp.status})`);
    }
    return sendJson(res, 200, { text: (data.text || '').trim() });
  } catch (err) {
    if (isAbortError(err)) return sendError(res, 504, 'Transcription took too long — try a shorter recording');
    return sendError(res, 502, err instanceof Error ? err.message : 'Transcription failed');
  }
}
