/**
 * Create or update the ElevenLabs voice interviewer from api/_lib/voiceAgent.ts.
 *
 *   ELEVENLABS_API_KEY=… npx tsx scripts/voice-agent.ts [--key-file path]
 *     [--agent-id agent_…] [--voice-id …] [--llm …] [--tts-model …]
 *
 * Finds the agent by ELEVENLABS_AGENT_ID / --agent-id, else by name; updates
 * its report tool and settings in place (safe to re-run), or creates both.
 * Prints the agent id to set as ELEVENLABS_AGENT_ID on the server.
 */
import { readFileSync } from 'node:fs';
import { AGENT_NAME, REPORT_TOOL_NAME, agentConfig, reportToolConfig } from '../api/_lib/voiceAgent.ts';

const API = 'https://api.elevenlabs.io';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const keyFile = flag('--key-file');
const KEY = (keyFile ? readFileSync(keyFile, 'utf8') : process.env.ELEVENLABS_API_KEY || '').trim();
if (!KEY) {
  console.error('Set ELEVENLABS_API_KEY or pass --key-file <path>.');
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function xi(method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch(API + path, {
    method,
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data).slice(0, 1200)}`);
  return data;
}

let agentId = flag('--agent-id') || process.env.ELEVENLABS_AGENT_ID || undefined;
if (!agentId) {
  const found = await xi('GET', `/v1/convai/agents?search=${encodeURIComponent(AGENT_NAME)}&page_size=30`);
  const matches = (found.agents ?? []).filter((a: { name?: string }) => a.name === AGENT_NAME);
  if (matches.length > 1) throw new Error(`Several agents are named "${AGENT_NAME}" — pass --agent-id.`);
  agentId = matches[0]?.agent_id;
}

// The report tool: the one this agent already uses, never another project's tool of the same name.
let toolId: string | undefined;
if (agentId) {
  const agent = await xi('GET', `/v1/convai/agents/${agentId}`);
  for (const id of (agent.conversation_config?.agent?.prompt?.tool_ids ?? []) as string[]) {
    const tool = await xi('GET', `/v1/convai/tools/${id}`);
    if (tool.tool_config?.name === REPORT_TOOL_NAME) {
      toolId = id;
      break;
    }
  }
}
if (toolId) await xi('PATCH', `/v1/convai/tools/${toolId}`, { tool_config: reportToolConfig() });
else toolId = (await xi('POST', '/v1/convai/tools', { tool_config: reportToolConfig() })).id as string;

const body = agentConfig({ toolId, voiceId: flag('--voice-id'), llm: flag('--llm'), ttsModel: flag('--tts-model') });
const created = !agentId;
if (agentId) await xi('PATCH', `/v1/convai/agents/${agentId}`, body);
else agentId = (await xi('POST', '/v1/convai/agents/create', body)).agent_id as string;

const agent = await xi('GET', `/v1/convai/agents/${agentId}`);
const cc = agent.conversation_config ?? {};
console.log(
  JSON.stringify(
    {
      action: created ? 'created' : 'updated',
      agent_id: agentId,
      tool_id: toolId,
      tts_model: cc.tts?.model_id,
      voice_id: cc.tts?.voice_id,
      llm: cc.agent?.prompt?.llm,
      first_message: cc.agent?.first_message,
      private: agent.platform_settings?.auth?.enable_auth,
      record_voice: agent.platform_settings?.privacy?.record_voice,
      retention_days: agent.platform_settings?.privacy?.retention_days,
    },
    null,
    2,
  ),
);
if (created) console.log(`\nSet ELEVENLABS_AGENT_ID=${agentId} on the server, e.g. vercel env add ELEVENLABS_AGENT_ID production`);
