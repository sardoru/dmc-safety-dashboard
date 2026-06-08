import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from '../_lib/auth.js';
import { sendError, sendJson, methodNotAllowed } from '../_lib/http.js';

const INCIDENT_TYPES = [
  'Medical Emergency',
  'Suspicious Activity',
  'Property Crime',
  'Noise Disturbance',
  'Fire/Hazard',
  'Other',
];

const INSTRUCTIONS = `You are the intake assistant for Downtown Memphis Commission (DMC) safety officers.
A DMC safety officer is verbally reporting something suspicious or an incident they witnessed downtown.
Be brief, calm, and professional — this is an operational tool, not a chat.
Ask short clarifying questions to capture: (1) the incident type, (2) a clear description (who, what, vehicles, clothing, direction of travel), and (3) where it happened (street, intersection, or landmark).
As soon as you have enough, call the file_suspicious_report function with the structured fields, then read back a single-sentence confirmation. Keep every spoken reply to one or two short sentences.`;

const FILE_REPORT_TOOL = {
  type: 'function',
  name: 'file_suspicious_report',
  description:
    'Record the structured suspicious-activity / incident report once enough detail has been gathered.',
  parameters: {
    type: 'object',
    properties: {
      incident_type: {
        type: 'string',
        enum: INCIDENT_TYPES,
        description: 'The category that best fits what the officer described.',
      },
      description: {
        type: 'string',
        description:
          'A concise factual summary: who/what was involved, vehicles, clothing, direction of travel.',
      },
      location_hint: {
        type: 'string',
        description: 'The street, intersection, or landmark where it was observed, if stated.',
      },
    },
    required: ['incident_type', 'description'],
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendError(res, 500, 'Voice reporting is not configured (missing OPENAI_API_KEY)');

  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
  const transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';

  const sessionConfig = {
    type: 'realtime',
    model,
    instructions: INSTRUCTIONS,
    audio: {
      input: {
        transcription: { model: transcribeModel },
        // Raised VAD threshold + longer silence to reduce mobile speaker echo
        // self-interruption (half-duplex gating is also applied client-side).
        turn_detection: {
          type: 'server_vad',
          threshold: 0.6,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
        },
      },
      output: { voice: 'marin' },
    },
    tools: [FILE_REPORT_TOOL],
    tool_choice: 'auto',
  };

  try {
    const resp = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': guard.user.id,
      },
      body: JSON.stringify({ session: sessionConfig }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      const msg =
        (data && (data.error?.message || data.message)) || `OpenAI error (${resp.status})`;
      return sendError(res, 502, msg);
    }

    return sendJson(res, 200, {
      value: data.value ?? data.client_secret?.value,
      expires_at: data.expires_at ?? data.client_secret?.expires_at,
      model,
    });
  } catch (err) {
    return sendError(res, 502, err instanceof Error ? err.message : 'Could not reach OpenAI');
  }
}
