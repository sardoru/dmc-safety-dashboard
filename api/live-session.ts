import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireRole } from './_lib/auth.js';
import { methodNotAllowed, readBody, sendError, sendJson } from './_lib/http.js';

/**
 * GPT-Live voice session for the officer portal.
 *
 * With GPT-Live the browser never talks to OpenAI to set up a call: it posts
 * its WebRTC offer here, this function creates the Live session (persona,
 * voice, the Responses backend it delegates to, the report tool) with the
 * project key, and hands the SDP answer back. Audio then flows browser ⇄
 * OpenAI over the peer connection; JSON events ride its `oai-events` data
 * channel.
 *
 * GPT-Live is full duplex: there is no turn detection, transcription or echo
 * setting to tune — the mic stays open for the whole call and the officer
 * interrupts by talking. Pacing, interruptions and silence are prompt policy.
 */
const LIVE_SESSIONS_URL = 'https://api.openai.com/v1/live/sessions';

const INCIDENT_TYPES = [
  'Medical Emergency',
  'Suspicious Activity',
  'Property Crime',
  'Noise Disturbance',
  'Fire/Hazard',
  'Other',
];

/* ── The LIVE prompt: the voice in front ─────────────────────────────────── */
const LIVE_INSTRUCTIONS = `You are the voice intake assistant for Core Downtown Memphis public-safety officers. A public-safety officer is calling in something suspicious or an incident they witnessed downtown, and you capture it for a written report.

Speak English throughout. Be brief, calm and professional — this is an operational tool, not a chat. Keep every spoken reply to one or two short sentences and ask ONE question at a time. Never mention the microphone, the connection, the transcript or the backend.

HOW TO RUN IT:
1. You speak first: greet the officer briefly and ask what they witnessed. One or two short sentences, then stop and listen.
2. Let them tell it. Then ask short clarifying questions, one at a time, until you have all three: (1) the incident type — one of ${INCIDENT_TYPES.join(', ')}; (2) a clear description — who and what, vehicles, clothing, direction of travel; (3) where it happened — a street, intersection or landmark. Don't ask for what they already said; if the incident type is obvious from the description, don't ask for it.
3. As soon as you have enough, hand the turn to your backend so it files the report, then read the officer the single-sentence confirmation it returns. Ask if there is anything to add; if not, tell them the draft is on their screen to review and submit.

BACKCHANNEL POLICY: Keep backchannels rare and short — a brief "go ahead" or "understood" while the officer is talking is enough. Do not talk over them.

INTERRUPTION POLICY: Stop speaking the moment the officer starts talking and listen to what they say. Don't restart your sentence afterwards; respond to what they said. If you hear your own words coming back faintly (an echo from their loudspeaker), ignore it — that is not the officer talking.

SILENCE POLICY: Officers pause to look around or check a detail — keep listening. If what you heard sounds unfinished, give a short nudge ("go on") rather than a new question. Don't treat street noise, radio chatter or someone talking nearby as a new report.

DELEGATION POLICY:
Backend tools:
- Report filer: records the structured suspicious-activity / incident report (incident type, description, location) with the file_suspicious_report tool and returns a one-sentence confirmation for you to read back.

Delegate to the backend when:
- You have the incident type, a clear description and the location (or the officer has said they don't know the exact location) and the report should be filed.
- The officer adds or corrects a detail after the report was filed — delegate again so the report is updated.

Do not delegate to the backend when:
- You still need a clarifying answer from the officer.
- The officer is only greeting you or asking what you need.

Delegate before giving an answer that depends on backend work. Do not guess the result while waiting; a few words of acknowledgment are fine ("filing that now").`;

/* ── The BACKEND prompt: the Responses model that holds the tool ─────────── */
const BACKEND_INSTRUCTIONS = `You are the report filer behind a live voice intake assistant for Core Downtown Memphis public-safety officers. The assistant is on a call with an officer who witnessed something suspicious or an incident downtown; it delegates to you when the report is ready to be filed, or when the officer has added or corrected a detail. You receive the conversation so far.

WHAT TO DO:
- If the conversation contains enough for a report — an incident type you can determine, a description, and a location or a clear statement that the location is unknown — call file_suspicious_report exactly once with the structured fields. After the tool result, reply with ONE short spoken-ready sentence that confirms what was filed and reads back the incident type and location (for example: "Filed as Suspicious Activity at Main and Madison — a man in a black hoodie trying car doors, heading north.").
- If the officer later adds or corrects a detail, call file_suspicious_report again with the complete, corrected fields, then confirm in one sentence.
- If something essential is still missing, do not call the tool: reply with the single clarifying question the assistant should ask.

FIELD RULES:
- incident_type: choose the closest of ${INCIDENT_TYPES.join(', ')}. Someone trying car doors, casing a storefront, loitering with intent or acting erratically is Suspicious Activity; a completed theft, break-in or vandalism is Property Crime.
- description: a concise factual summary in plain report style — who and what was observed, vehicles (make, colour, plate), clothing, direction of travel, weapons if mentioned. Use only what the officer said; never invent details. Leave out the officer's own name and the location (it has its own field).
- location_hint: the street, intersection or landmark as the officer said it, normalised for Downtown Memphis (for example "Main St and Madison Ave", "Court Square"). Omit it if the officer does not know.

HOW TO ANSWER: Plain spoken English, at most three short sentences, no lists, no markdown, no headings, no preamble.`;

/* ── The OPENING: sent by the browser once the session starts ────────────── */
/**
 * GPT-Live waits for the caller by default. OpenAI's greeting recipe: append
 * instructions to greet now, wait for the ack, then a commentary nudge to
 * begin. The browser sends both over the data channel after `session.started`.
 */
const OPENING = {
  instructions:
    'The line is open and the officer can hear you. Speak first, right now, in English, without waiting for them to say anything: greet the officer briefly in one short sentence and ask what they witnessed, exactly as your instructions describe. Then stop and listen.',
  commentary: 'Begin the conversation now, following the instructions provided.',
};

/** Lives on the Responses backend; the browser answers it over the data channel. */
const FILE_REPORT_TOOL = {
  type: 'function',
  name: 'file_suspicious_report',
  description:
    'Record the structured suspicious-activity / incident report once enough detail has been gathered. The draft appears on the officer\'s screen for review.',
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
    additionalProperties: false,
  },
};

/**
 * The only client events the browser may send on its data channel. The
 * frontend is untrusted: it gets to script the opening, mute itself, answer
 * the report tool and hang up — not to rewire the backend.
 */
const CLIENT_EVENTS_ALLOWED = [
  'session.instructions.append',
  'session.commentary.append',
  'session.input_audio.mute',
  'session.input_audio.unmute',
  'session.close',
  'response.item.create',
  'response.create',
];

type BackendEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';
function backendEffort(): BackendEffort {
  const e = process.env.OPENAI_LIVE_BACKEND_EFFORT;
  return e === 'none' || e === 'minimal' || e === 'medium' || e === 'high' ? e : 'low';
}

/** `session` in `POST /v1/live/sessions`. Voice, instructions and delegation type are immutable after startup. */
export function liveSessionConfig() {
  return {
    model: process.env.OPENAI_LIVE_MODEL || 'gpt-live-1',
    instructions: LIVE_INSTRUCTIONS,
    audio: { output: { voice: process.env.OPENAI_LIVE_VOICE || 'marin' } },
    delegation: {
      type: 'responses',
      responses: {
        model: process.env.OPENAI_LIVE_BACKEND_MODEL || 'gpt-5.6-terra',
        instructions: BACKEND_INSTRUCTIONS,
        tools: [FILE_REPORT_TOOL],
        tool_choice: 'auto',
        parallel_tool_calls: false,
        reasoning: { effort: backendEffort() },
        text: { verbosity: 'low' },
        max_output_tokens: 400,
      },
    },
    client: { data_channel: { allowed_client_events: CLIENT_EVENTS_ALLOWED } },
  };
}

interface LiveCreateResponse {
  session?: { id?: string };
  transport?: { type?: string; sdp?: string };
  error?: { code?: string; message?: string; type?: string };
  message?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const guard = await requireRole(req, ['officer', 'admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendError(res, 503, 'Voice reporting is not configured (missing OPENAI_API_KEY)');

  const { sdp } = readBody<{ sdp?: unknown }>(req);
  if (typeof sdp !== 'string' || !/^v=0/m.test(sdp) || !/^m=audio/m.test(sdp)) {
    return sendError(res, 400, 'A WebRTC SDP offer with an audio section is required');
  }

  try {
    const resp = await fetch(LIVE_SESSIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': guard.user.id,
      },
      body: JSON.stringify({ session: liveSessionConfig(), transport: { type: 'webrtc', sdp } }),
    });

    const data = (await resp.json().catch(() => ({}))) as LiveCreateResponse;
    if (!resp.ok) {
      const msg = data.error?.message || data.message || `OpenAI error (${resp.status})`;
      if (data.error?.code === 'invalid_offer') return sendError(res, 400, msg);
      console.error('[live-session] create failed:', resp.status, data.error ?? data);
      return sendError(res, 502, msg);
    }

    const answer = data.transport?.sdp;
    if (!answer) return sendError(res, 502, 'OpenAI returned no SDP answer');

    return sendJson(res, 200, {
      sdp: answer,
      sessionId: data.session?.id ?? null,
      opening: OPENING,
    });
  } catch (err) {
    return sendError(res, 502, err instanceof Error ? err.message : 'Could not reach OpenAI');
  }
}
