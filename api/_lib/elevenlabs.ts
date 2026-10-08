/**
 * ElevenLabs text-to-speech (Eleven v4).
 *
 * Eleven v4 launched on the Text to Dialogue API, so that is the first route
 * we try: POST /v1/text-to-dialogue/stream with a single-voice `inputs` list.
 * If the account or endpoint rejects the model we fall back to the classic
 * /v1/text-to-speech/{voice}/stream route — first with v4, then with the
 * configured fallback model — so speech keeps working while v4 rolls out.
 */
import { fetchWithTimeout, isAbortError } from './http.js';

const BASE = 'https://api.elevenlabs.io';
/** Text to Dialogue caps the combined text; longer text can end early with a 200. */
const DIALOGUE_MAX_CHARS = 2000;

export const DEFAULT_MODEL = 'eleven_v4';
export const DEFAULT_FALLBACK_MODEL = 'eleven_multilingual_v2';
/** "George" — a premade library voice every account can use. */
export const DEFAULT_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
const OUTPUT_FORMAT = 'mp3_44100_128';

export interface VoiceInfo {
  id: string;
  name: string;
  category?: string;
  description?: string;
  accent?: string;
  gender?: string;
  age?: string;
  useCase?: string;
  previewUrl?: string;
}

/**
 * Premade ElevenLabs voices, used when the API key can't list voices
 * (keys scoped to text-to-speech only lack `voices_read`).
 */
export const CURATED_VOICES: VoiceInfo[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', description: 'Warm, steady narrator', accent: 'British', gender: 'male', age: 'middle aged' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', description: 'Calm, reassuring', accent: 'American', gender: 'female', age: 'young' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', description: 'Deep, resonant', accent: 'American', gender: 'male', age: 'middle aged' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', description: 'Bright, expressive', accent: 'American', gender: 'female', age: 'young' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Authoritative broadcaster', accent: 'British', gender: 'male', age: 'middle aged' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', description: 'Clear, confident', accent: 'British', gender: 'female', age: 'middle aged' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', description: 'Friendly, smooth', accent: 'American', gender: 'male', age: 'middle aged' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', description: 'Upbeat, quirky', accent: 'American', gender: 'female', age: 'young' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', description: 'Articulate, energetic', accent: 'American', gender: 'male', age: 'young' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', description: 'Friendly, warm', accent: 'American', gender: 'female', age: 'middle aged' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', description: 'Easy-going, confident', accent: 'American', gender: 'male', age: 'middle aged' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', description: 'Relaxed, neutral', accent: 'American', gender: 'neutral', age: 'middle aged' },
];

export function elevenConfig() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    model: process.env.ELEVENLABS_MODEL || DEFAULT_MODEL,
    fallbackModel: process.env.ELEVENLABS_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL,
    voiceId: process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID,
  };
}

export class TtsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function errorMessage(resp: Response): Promise<string> {
  const raw = await resp.text().catch(() => '');
  try {
    const data = JSON.parse(raw) as { detail?: unknown; message?: string };
    const d = data.detail;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object' && 'message' in d) return String((d as { message: unknown }).message);
    if (Array.isArray(d) && d[0] && typeof d[0] === 'object' && 'msg' in d[0]) return String(d[0].msg);
    if (data.message) return data.message;
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 200) || `ElevenLabs error (${resp.status})`;
}

interface Attempt {
  route: 'dialogue' | 'tts';
  model: string;
}

/**
 * Synthesize `text` and return the upstream streaming response (audio/mpeg).
 * The caller pipes `response.body` to the client.
 */
export async function synthesize(
  text: string,
  voiceId: string,
): Promise<{ response: Response; attempt: Attempt }> {
  const cfg = elevenConfig();
  if (!cfg.apiKey) throw new TtsError(503, 'ElevenLabs is not configured (missing ELEVENLABS_API_KEY)');

  const attempts: Attempt[] = [];
  if (text.length <= DIALOGUE_MAX_CHARS) attempts.push({ route: 'dialogue', model: cfg.model });
  attempts.push({ route: 'tts', model: cfg.model });
  if (cfg.fallbackModel && cfg.fallbackModel !== cfg.model) {
    attempts.push({ route: 'tts', model: cfg.fallbackModel });
  }

  let last = new TtsError(502, 'Speech synthesis failed');
  for (const attempt of attempts) {
    const url =
      attempt.route === 'dialogue'
        ? `${BASE}/v1/text-to-dialogue/stream?output_format=${OUTPUT_FORMAT}`
        : `${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=${OUTPUT_FORMAT}`;
    const body =
      attempt.route === 'dialogue'
        ? { inputs: [{ text, voice_id: voiceId }], model_id: attempt.model }
        : { text, model_id: attempt.model };

    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify(body),
        },
        12_000,
      );
    } catch (err) {
      if (isAbortError(err)) throw new TtsError(504, 'The voice service took too long to answer');
      throw new TtsError(502, err instanceof Error ? err.message : 'Could not reach ElevenLabs');
    }

    if (resp.ok && resp.body) return { response: resp, attempt };

    const message = await errorMessage(resp);
    // Auth, quota and rate limits won't be fixed by another route or model.
    if (resp.status === 401 || resp.status === 402 || resp.status === 429) {
      throw new TtsError(resp.status === 401 ? 503 : resp.status, message);
    }
    last = new TtsError(502, message);
    // 400/404/422 = this route or model isn't available here: try the next one.
    if (![400, 404, 405, 422].includes(resp.status)) break;
  }
  throw last;
}

let voiceCache: { at: number; voices: VoiceInfo[] } | null = null;
const VOICE_TTL_MS = 10 * 60_000;

interface ApiVoice {
  voice_id?: string;
  name?: string;
  category?: string;
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
}

/** The account's voices (premade + its own), falling back to the curated list. */
export async function listVoices(): Promise<{ voices: VoiceInfo[]; source: 'account' | 'curated' }> {
  const cfg = elevenConfig();
  if (!cfg.apiKey) return { voices: CURATED_VOICES, source: 'curated' };
  if (voiceCache && Date.now() - voiceCache.at < VOICE_TTL_MS) {
    return { voices: voiceCache.voices, source: 'account' };
  }
  try {
    const resp = await fetchWithTimeout(
      `${BASE}/v2/voices?page_size=100&sort=name&sort_direction=asc`,
      { headers: { 'xi-api-key': cfg.apiKey } },
      8_000,
    );
    if (!resp.ok) return { voices: CURATED_VOICES, source: 'curated' };
    const data = (await resp.json()) as { voices?: ApiVoice[] };
    const voices = (data.voices ?? [])
      .filter((v) => v.voice_id && v.name)
      .map<VoiceInfo>((v) => ({
        id: v.voice_id as string,
        name: v.name as string,
        category: v.category,
        description: v.labels?.description || v.description?.slice(0, 80),
        accent: v.labels?.accent,
        gender: v.labels?.gender,
        age: v.labels?.age,
        useCase: v.labels?.use_case,
        previewUrl: v.preview_url,
      }));
    if (!voices.length) return { voices: CURATED_VOICES, source: 'curated' };
    voiceCache = { at: Date.now(), voices };
    return { voices, source: 'account' };
  } catch {
    return { voices: CURATED_VOICES, source: 'curated' };
  }
}
