import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../_lib/http.js';

const INCIDENT_TYPES = [
  'Medical Emergency',
  'Suspicious Activity',
  'Property Crime',
  'Noise Disturbance',
  'Fire/Hazard',
  'Other',
];

/**
 * Turn a raw spoken transcript into a structured report: a best-fit incident
 * type, a cleaned one/two-sentence description, and any location mentioned.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const apiKey = process.env.OPENAI_API_KEY;
  const { transcript } = readBody<{ transcript?: string }>(req);
  if (!transcript || !transcript.trim()) return sendError(res, 400, 'Missing transcript');

  // Degrade gracefully if no key — return the raw transcript as the description.
  if (!apiKey) {
    return sendJson(res, 200, {
      incident_type: 'Suspicious Activity',
      description: transcript.trim(),
      location_hint: '',
    });
  }

  const model = process.env.OPENAI_EXTRACT_MODEL || 'gpt-4o-mini';
  const system = `You convert a Downtown Memphis safety officer's spoken report into a structured JSON object.
Return ONLY JSON with keys: incident_type (one of ${INCIDENT_TYPES.join(', ')}), description (a clean, factual 1-2 sentence summary in the third person), location_hint (any street/intersection/landmark mentioned, else "").
Pick the single best incident_type. Do not invent details that were not said.`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: transcript.trim() },
        ],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return sendError(res, 502, data?.error?.message || `Extraction failed (${resp.status})`);
    }

    let parsed: { incident_type?: string; description?: string; location_hint?: string } = {};
    try {
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    } catch {
      parsed = {};
    }

    const incident_type = INCIDENT_TYPES.includes(parsed.incident_type ?? '')
      ? parsed.incident_type
      : 'Suspicious Activity';

    return sendJson(res, 200, {
      incident_type,
      description: parsed.description?.trim() || transcript.trim(),
      location_hint: parsed.location_hint?.trim() || '',
    });
  } catch (err) {
    return sendError(res, 502, err instanceof Error ? err.message : 'Extraction failed');
  }
}
