import type { SchemaCaps } from '../../lib/schema';
import type { WsStatus } from '../../types';

/**
 * Integration health for the admin System tab.
 *   ok       ✓ ready
 *   warning  ⚠ works, but degraded or needs an action (e.g. a migration)
 *   error    ✗ the feature is unavailable until something is configured
 *   info     neutral — optional, off, demo, or not checkable from the browser
 *   checking still asking the server
 */
export type HealthState = 'ok' | 'warning' | 'error' | 'info' | 'checking';

export interface Health {
  state: HealthState;
  label: string;
}

export interface LiveSessionStatus {
  loading: boolean;
  configured: boolean | null;
  /** `elevenlabs`: the Eleven v4 agent. `gpt-live`: the OpenAI fallback line. */
  provider?: 'elevenlabs' | 'gpt-live' | null;
  model?: string;
  error?: string;
}

/** The subset of `useVoice().info` the health check needs. */
export interface TtsStatus {
  loading: boolean;
  configured: boolean | null;
  error?: string;
}

export interface RadioStatus {
  enabled: boolean;
  wsStatus: WsStatus;
  isLive: boolean;
}

export interface SystemHealth {
  database: Health;
  voice: Health;
  speech: Health;
  email: Health;
  scanner: Health;
}

export interface EnvVar {
  name: string;
  /** server = Vercel function env; client = baked into the Vite build. */
  where: 'server' | 'client';
  optional?: boolean;
  note?: string;
}

export function schemaComplete(caps: SchemaCaps): boolean {
  return caps.v2 && caps.updates && caps.bolos;
}

function databaseHealth(isDemo: boolean, caps: SchemaCaps): Health {
  if (isDemo) return { state: 'info', label: 'Demo mode' };
  if (!caps.checked) return { state: 'checking', label: 'Checking…' };
  if (schemaComplete(caps) && caps.community) return { state: 'ok', label: 'Connected' };
  return { state: 'warning', label: 'Migration needed' };
}

function voiceHealth(isDemo: boolean, live: LiveSessionStatus): Health {
  if (isDemo) return { state: 'info', label: 'Connected only' };
  if (live.loading) return { state: 'checking', label: 'Checking…' };
  if (live.error) return { state: 'error', label: 'Unreachable' };
  if (live.configured) return { state: 'ok', label: 'Ready' };
  return { state: 'error', label: 'Not configured' };
}

function speechHealth(isDemo: boolean, tts: TtsStatus): Health {
  if (isDemo) return { state: 'info', label: 'Browser voice' };
  if (tts.loading) return { state: 'checking', label: 'Checking…' };
  if (tts.configured) return { state: 'ok', label: 'Ready' };
  // Speech still works through the browser voice, so this is degraded, not down.
  if (tts.error && tts.error !== 'signed-out') return { state: 'warning', label: 'Unreachable' };
  return { state: 'warning', label: 'Not configured' };
}

function scannerHealth(radio: RadioStatus): Health {
  if (!radio.enabled) return { state: 'info', label: 'Off' };
  if (!radio.isLive) return { state: 'info', label: 'Paused' };
  if (radio.wsStatus === 'connected') return { state: 'ok', label: 'Connected' };
  if (radio.wsStatus === 'connecting') return { state: 'checking', label: 'Connecting…' };
  return { state: 'warning', label: 'Unreachable' };
}

export function systemHealth(input: {
  isDemo: boolean;
  caps: SchemaCaps;
  live: LiveSessionStatus;
  tts: TtsStatus;
  radio: RadioStatus;
}): SystemHealth {
  return {
    database: databaseHealth(input.isDemo, input.caps),
    voice: voiceHealth(input.isDemo, input.live),
    speech: speechHealth(input.isDemo, input.tts),
    // Resend keys live on the server and can't be probed from the browser.
    email: { state: 'info', label: input.isDemo ? 'Off in demo' : 'Server-side' },
    scanner: scannerHealth(input.radio),
  };
}

export function countIssues(h: SystemHealth): number {
  return Object.values(h).filter((x) => x.state === 'error' || x.state === 'warning').length;
}

export function isChecking(h: SystemHealth): boolean {
  return Object.values(h).some((x) => x.state === 'checking');
}

export const MIGRATION_0002 = 'supabase/migrations/0002_incidents_bolos.sql';
export const MIGRATION_0007 = 'supabase/migrations/0007_community_report_privacy.sql';

export const ENV_DATABASE: EnvVar[] = [
  { name: 'VITE_SUPABASE_URL', where: 'client' },
  { name: 'VITE_SUPABASE_ANON_KEY', where: 'client' },
  { name: 'SUPABASE_URL', where: 'server' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', where: 'server' },
];

export const ENV_VOICE: EnvVar[] = [
  { name: 'ELEVENLABS_API_KEY', where: 'server' },
  { name: 'ELEVENLABS_AGENT_ID', where: 'server', note: 'from scripts/voice-agent.ts' },
  { name: 'OPENAI_API_KEY', where: 'server', optional: true, note: 'GPT-Live fallback' },
];

export const ENV_SPEECH: EnvVar[] = [
  { name: 'ELEVENLABS_API_KEY', where: 'server' },
  { name: 'ELEVENLABS_MODEL', where: 'server', optional: true, note: 'default eleven_v4' },
  { name: 'ELEVENLABS_VOICE_ID', where: 'server', optional: true, note: 'default voice' },
];

export const ENV_EMAIL: EnvVar[] = [
  { name: 'RESEND_API_KEY', where: 'server' },
  { name: 'SEND_EMAIL_HOOK_SECRET', where: 'server', note: 'v1,whsec_…' },
  { name: 'EMAIL_FROM', where: 'server', optional: true, note: 'verified sender' },
  { name: 'EMAIL_REPLY_TO', where: 'server', optional: true, note: 'where replies go' },
  { name: 'RESEND_WEBHOOK_SECRET', where: 'server', optional: true, note: 'reply relay webhook' },
  { name: 'INBOUND_FORWARD_TO', where: 'server', optional: true, note: 'reply relay inbox (hidden)' },
];

export const ENV_SCANNER: EnvVar[] = [{ name: 'VITE_RADIO_WS_URL', where: 'client', note: 'bridge WebSocket URL' }];

/** Host of the configured Supabase project, e.g. "abcd.supabase.co" (the URL is public). */
export const SUPABASE_HOST: string | null = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
})();
