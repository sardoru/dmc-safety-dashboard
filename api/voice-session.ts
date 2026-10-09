import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from './_lib/auth.js';
import { callerContext } from './_lib/caller.js';
import { fetchWithTimeout, isAbortError, methodNotAllowed, sendError, sendJson } from './_lib/http.js';
import { AGENT_TTS_MODEL, dynamicVariablesFor, REPORT_TOOL_NAME } from './_lib/voiceAgent.js';

/**
 * The voice reporting line.
 *
 * Preferred: the ElevenLabs agent (Eleven v4). This function mints a one-time
 * WebRTC conversation token for a signed-in member — the ElevenLabs key never
 * leaves the server — and returns who is calling, read from the database, for
 * the agent's dynamic variables. The browser then talks to the agent directly.
 * Fallback: when the agent isn't configured, the GPT-Live line
 * (`/api/live-session`) still works with an OpenAI key.
 *
 *   GET  /api/voice-session → { configured, provider, model }
 *   POST /api/voice-session → { provider: 'elevenlabs', token, dynamicVariables, tool }
 */
const TOKEN_URL = 'https://api.elevenlabs.io/v1/convai/conversation/token';

type Provider = 'elevenlabs' | 'gpt-live';

function provider(): Provider | null {
  if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_AGENT_ID) return 'elevenlabs';
  if (process.env.OPENAI_API_KEY) return 'gpt-live';
  return null;
}

// Best effort per instance: a member can start a handful of calls in a row, not a flood.
const STARTS_PER_WINDOW = 6;
const WINDOW_MS = 10 * 60_000;
const starts = new Map<string, number[]>();
function tooMany(userId: string, now = Date.now()): boolean {
  const recent = (starts.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= STARTS_PER_WINDOW) {
    starts.set(userId, recent);
    return true;
  }
  recent.push(now);
  starts.set(userId, recent);
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['GET', 'POST'])) return;

  const guard = await requireRole(req, ['business', 'officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const p = provider();

  if (req.method === 'GET') {
    return sendJson(res, 200, {
      configured: p !== null,
      provider: p,
      model: p === 'elevenlabs' ? AGENT_TTS_MODEL : p === 'gpt-live' ? process.env.OPENAI_LIVE_MODEL || 'gpt-live-1' : null,
    });
  }

  if (p !== 'elevenlabs') return sendError(res, 503, 'The ElevenLabs voice line is not configured');
  if (tooMany(guard.user.id)) return sendError(res, 429, 'Too many calls in a row — wait a few minutes and try again');

  const agentId = process.env.ELEVENLABS_AGENT_ID as string;
  const [ctx, token] = await Promise.all([
    callerContext(guard.user.id, guard.user.role),
    fetchWithTimeout(
      `${TOKEN_URL}?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY as string } },
      10_000,
    )
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as { token?: string; detail?: unknown };
        if (!r.ok || !data.token) {
          console.error('[voice-session] token failed:', r.status, data.detail ?? data);
          return { error: r.status === 401 || r.status === 403 ? 'The voice service rejected our key' : `The voice service answered ${r.status}` };
        }
        return { token: data.token };
      })
      .catch((err: unknown) => ({
        error: isAbortError(err) ? 'The voice service took too long to answer — try again' : 'Could not reach the voice service',
      })),
  ]);

  if ('error' in token) return sendError(res, 502, token.error ?? 'Could not start the call');
  return sendJson(res, 200, {
    provider: 'elevenlabs',
    token: token.token,
    dynamicVariables: dynamicVariablesFor(ctx),
    tool: REPORT_TOOL_NAME,
  });
}
