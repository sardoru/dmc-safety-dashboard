/**
 * Small Responses-API helper for the text tasks (report extraction, shift
 * briefings). It walks a model chain so a renamed or unavailable model never
 * takes a feature down, and retries a model once without the optional knobs
 * (reasoning / verbosity / safety id) when it rejects them.
 */
import { fetchWithTimeout, isAbortError } from './http.js';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';

export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Model chain: the feature's own override, the project-wide one, then known-good defaults. */
export function modelChain(featureEnv?: string): string[] {
  const list = [
    featureEnv ? process.env[featureEnv] : undefined,
    process.env.OPENAI_TEXT_MODEL,
    'gpt-5.6-luna',
    'gpt-4.1-mini',
  ].filter((m): m is string => Boolean(m && m.trim()));
  return [...new Set(list.map((m) => m.trim()))];
}

export interface RespondOptions {
  instructions: string;
  input: string;
  models: string[];
  /** Ask for JSON that matches this schema (non-strict structured output). */
  json?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
  /** Stable per-user id OpenAI uses for abuse monitoring. */
  safetyIdentifier?: string;
}

interface ResponsesPayload {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  error?: { message?: string; code?: string; type?: string };
}

function outputText(data: ResponsesPayload): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text;
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
    }
  }
  return parts.join('').trim();
}

export async function respond(opts: RespondOptions): Promise<{ text: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new UpstreamError(503, 'OpenAI is not configured (missing OPENAI_API_KEY)');

  let lastError: UpstreamError = new UpstreamError(502, 'No model produced a response');
  // The whole model chain must finish inside the function's 30 s limit.
  const deadline = Date.now() + 25_000;

  for (const model of opts.models) {
    for (const full of [true, false]) {
      const body: Record<string, unknown> = {
        model,
        instructions: opts.instructions,
        input: opts.input,
        max_output_tokens: opts.maxOutputTokens ?? 600,
        store: false,
      };
      const text: Record<string, unknown> = {};
      if (opts.json) {
        text.format = { type: 'json_schema', name: opts.json.name, schema: opts.json.schema, strict: false };
      }
      if (full) {
        body.reasoning = { effort: opts.effort ?? 'low' };
        text.verbosity = 'low';
        if (opts.safetyIdentifier) body.safety_identifier = opts.safetyIdentifier;
      }
      if (Object.keys(text).length) body.text = text;

      const left = deadline - Date.now();
      if (left < 2_000) throw new UpstreamError(504, 'The text service took too long to answer');
      let resp: Response;
      try {
        resp = await fetchWithTimeout(
          RESPONSES_URL,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          left,
        );
      } catch (err) {
        if (isAbortError(err)) throw new UpstreamError(504, 'The text service took too long to answer');
        throw new UpstreamError(502, err instanceof Error ? err.message : 'Could not reach OpenAI');
      }

      const data = (await resp.json().catch(() => ({}))) as ResponsesPayload;
      if (resp.ok) {
        const out = outputText(data);
        if (out && data.status === 'incomplete') {
          // Cut off (usually max_output_tokens). Truncated JSON is useless, so
          // try the next model; text keeps its last complete sentence.
          const reason = data.incomplete_details?.reason ?? 'incomplete';
          if (opts.json) {
            lastError = new UpstreamError(502, `${model} stopped early (${reason})`);
            break; // next model
          }
          const whole = out.match(/^[\s\S]*[.!?](?=\s|$)/)?.[0];
          return { text: whole ?? out, model };
        }
        if (out) return { text: out, model };
        lastError = new UpstreamError(502, `${model} returned an empty response`);
        break; // next model
      }

      const message = data.error?.message || `OpenAI error (${resp.status})`;
      lastError = new UpstreamError(resp.status === 401 ? 503 : 502, message);
      if (resp.status === 401 || resp.status === 429) throw lastError;
      // A 400 may just be an optional knob this model rejects: retry it bare
      // once. Anything else (unknown model, 5xx) moves on to the next model.
      if (resp.status === 400 && full && data.error?.code !== 'model_not_found') continue;
      break;
    }
  }
  throw lastError;
}

/** Parse a JSON object out of model text (tolerates code fences). */
export function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}
