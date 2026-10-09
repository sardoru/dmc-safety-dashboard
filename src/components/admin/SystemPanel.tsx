import { AudioLines, Copy, Database, Mail, Mic, RadioTower, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import { RADIO_BRIDGE_ENABLED, useRadio } from '../../context/RadioContext';
import { useToast } from '../../context/ToastContext';
import { useVoice } from '../../context/VoiceContext';
import { plural } from '../../lib/format';
import { SITE_URL } from '../../lib/supabase';
import { Button, IconButton } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import ListenButton from '../voice/ListenButton';
import IntegrationCard, { CheckItem, DetailList, EnvList } from './IntegrationCard';
import {
  countIssues,
  ENV_DATABASE,
  ENV_EMAIL,
  ENV_SCANNER,
  ENV_SPEECH,
  ENV_VOICE,
  isChecking,
  MIGRATION_0002,
  MIGRATION_0007,
  schemaComplete,
  SUPABASE_HOST,
  type SystemHealth,
} from './systemHealth';
import type { LiveSessionState } from './useLiveSessionStatus';

const SAMPLE_ALERT =
  'New report. Priority two. Suspicious person near South Main Street and Beale Street. A man in a gray hoodie is trying car door handles, heading south toward Peabody Place.';

const WS_LABEL = { connected: 'Connected', connecting: 'Connecting…', disconnected: 'Not connected', mock: 'Simulated' } as const;

function Mono({ children }: { children: string }) {
  return <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px] text-ink wrap-anywhere">{children}</code>;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { push } = useToast();
  const copy = () => {
    if (!navigator.clipboard) {
      push({ title: 'Couldn’t copy', body: value, tone: 'warning' });
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => push({ title: 'Copied', body: value, tone: 'success', duration: 2500 }),
      () => push({ title: 'Couldn’t copy', body: value, tone: 'warning' }),
    );
  };
  return (
    <IconButton label={label} size="sm" onClick={copy}>
      <Copy className="h-4 w-4" />
    </IconButton>
  );
}

function RecheckButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={busy} icon={<RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}>
      Recheck
    </Button>
  );
}

interface SystemPanelProps {
  health: SystemHealth;
  live: LiveSessionState;
}

/** Admin › System: is every integration connected, and what to set when it isn't. */
export default function SystemPanel({ health, live }: SystemPanelProps) {
  const { isDemo } = useAuth();
  const { caps } = useIncidents();
  const { info, refreshInfo, voiceLabel } = useVoice();
  const { entries, wsStatus } = useRadio();

  const issues = countIssues(health);
  const checking = isChecking(health);
  const hookUrl = `${SITE_URL}/api/auth/email-hook`;
  const defaultVoice = info.voices.find((v) => v.id === info.defaultVoiceId)?.name ?? info.defaultVoiceId;

  return (
    <div className="space-y-5">
      {issues > 0 ? (
        <Banner tone="warning" title={`${plural(issues, 'integration')} need${issues === 1 ? 's' : ''} attention`}>
          Each card below says what to set. Server variables live in Vercel → Project → Settings → Environment Variables;
          redeploy after changing them.
        </Banner>
      ) : isDemo ? (
        <Banner tone="info" title="Demo mode">
          The dashboard is running on sample data in this browser. Connect Supabase and add the server keys below to go live.
        </Banner>
      ) : checking ? (
        <Banner tone="info" title="Checking integrations…">This takes a moment after the page loads.</Banner>
      ) : (
        <Banner tone="success" title="All systems ready">
          Database, voice interviews and speech are connected.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Database ─────────────────────────────────────────────────── */}
        <IntegrationCard
          className="lg:col-span-2"
          icon={<Database className="h-[18px] w-[18px]" />}
          title="Database"
          provider="Supabase · Postgres, Auth, Realtime"
          health={health.database}
        >
          {isDemo ? (
            <>
              <p>
                Running on sample data saved in this browser. Nothing is shared between devices or sent to officers, and
                sign-in is replaced by the demo role picker.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <EnvList title="To connect" vars={ENV_DATABASE} />
                <p className="text-[12px] leading-relaxed text-muted">
                  Then run <Mono>supabase/migrations/0001_init.sql</Mono> and <Mono>{MIGRATION_0002}</Mono> in the
                  Supabase SQL editor (or <Mono>supabase db push</Mono>).
                </p>
              </div>
            </>
          ) : (
            <>
              <DetailList
                items={[
                  { label: 'Project', value: SUPABASE_HOST ?? 'Configured', mono: Boolean(SUPABASE_HOST) },
                  {
                    label: 'Schema',
                    value: !caps.checked
                      ? 'Checking…'
                      : !schemaComplete(caps)
                        ? 'Migration 0002 is missing or incomplete'
                        : caps.community
                          ? 'Migrations 0002 and 0007 applied'
                          : 'Migration 0007 is missing',
                  },
                ]}
              />
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                <CheckItem
                  ok={caps.checked ? caps.v2 : null}
                  label="Incident fields"
                  detail="Priority, descriptions, photos"
                />
                <CheckItem ok={caps.checked ? caps.updates : null} label="Incident timeline" detail="report_updates table" />
                <CheckItem ok={caps.checked ? caps.bolos : null} label="Lookout board" detail="bolos table" />
                <CheckItem
                  ok={caps.checked ? caps.community : null}
                  label="Private report fields"
                  detail="community_reports table"
                />
              </ul>
              {caps.checked && !schemaComplete(caps) && (
                <Banner tone="warning" title="Run migration 0002">
                  Paste <Mono>{MIGRATION_0002}</Mono> into the Supabase SQL editor (or run <Mono>supabase db push</Mono>)
                  and reload. It’s safe to run more than once; until then priorities, the timeline and the lookout board
                  stay off.
                </Banner>
              )}
              {caps.checked && schemaComplete(caps) && !caps.community && (
                <Banner tone="warning" title="Run migration 0007">
                  Paste <Mono>{MIGRATION_0007}</Mono> into the Supabase SQL editor and reload. Until it runs, every member
                  business still receives other members’ contact phone numbers, transcripts and photo links with the
                  community alerts (the app doesn’t show them, but they reach the browser). It’s safe to run more than
                  once.
                </Banner>
              )}
            </>
          )}
        </IntegrationCard>

        {/* ── Voice interviewer ───────────────────────────────────────── */}
        <IntegrationCard
          icon={<Mic className="h-[18px] w-[18px]" />}
          title="Voice interviewer"
          provider={live.provider === 'gpt-live' ? 'OpenAI GPT-Live (fallback)' : 'ElevenLabs Eleven v4'}
          health={health.voice}
          footer={!isDemo && <RecheckButton onClick={live.recheck} busy={live.loading} />}
        >
          {isDemo ? (
            <>
              <p>
                Businesses and officers can file a report by talking it through with an interviewer that asks the
                follow-up questions, in an Eleven v4 voice. Available on the connected deployment.
              </p>
              <EnvList title="On the connected deployment" vars={ENV_VOICE} />
            </>
          ) : live.loading ? (
            <p className="text-muted">Asking /api/voice-session…</p>
          ) : live.error ? (
            <>
              <p>
                Couldn’t reach the voice service: <span className="font-medium text-ink">{live.error}</span>. Check that
                the /api functions are deployed.
              </p>
              <EnvList title="Required on the server" vars={ENV_VOICE} />
            </>
          ) : live.configured ? (
            <>
              <p>
                Callers talk with the interviewer and it files a structured report for officers.
                {live.provider === 'gpt-live' && ' This is the OpenAI fallback line — set ELEVENLABS_AGENT_ID for the Eleven v4 voice.'}
              </p>
              <DetailList
                items={[
                  { label: 'Engine', value: live.provider === 'gpt-live' ? 'OpenAI GPT-Live' : 'ElevenLabs agent' },
                  { label: 'Model', value: live.model ?? '—', mono: true },
                ]}
              />
            </>
          ) : (
            <>
              <p>Voice interviews are unavailable. People can still file reports with the written form.</p>
              <EnvList title="To enable" vars={ENV_VOICE} />
            </>
          )}
        </IntegrationCard>

        {/* ── Speech ──────────────────────────────────────────────────── */}
        <IntegrationCard
          icon={<AudioLines className="h-[18px] w-[18px]" />}
          title="Speech"
          provider="ElevenLabs Eleven v4"
          health={health.speech}
          footer={
            <>
              <ListenButton text={SAMPLE_ALERT} speechKey="admin-voice-test" label="Test the voice" />
              {!isDemo && <RecheckButton onClick={() => void refreshInfo()} busy={info.loading} />}
            </>
          }
        >
          {isDemo ? (
            <>
              <p>
                Demo mode speaks with your browser’s built-in voice. The connected deployment reads alerts, briefings and
                read-backs with ElevenLabs Eleven v4.
              </p>
              <EnvList title="On the connected deployment" vars={ENV_SPEECH} />
            </>
          ) : info.loading ? (
            <p className="text-muted">Asking /api/tts…</p>
          ) : info.configured ? (
            <>
              <DetailList
                items={[
                  {
                    label: 'Model',
                    value: info.fallbackModel ? `${info.model ?? 'eleven_v4'} → ${info.fallbackModel}` : (info.model ?? 'eleven_v4'),
                    mono: true,
                  },
                  {
                    label: 'Voices',
                    value: `${info.voices.length} · ${info.voiceSource === 'account' ? 'your ElevenLabs library' : 'premade voices'}`,
                  },
                  { label: 'Default', value: defaultVoice ?? 'George' },
                  { label: 'Your voice', value: voiceLabel },
                ]}
              />
              {info.voiceSource === 'curated' && (
                <p className="text-[12px] text-muted">
                  The API key can’t list your voice library, so ElevenLabs’ premade voices are offered. Give the key the{' '}
                  <Mono>voices_read</Mono> permission to use your own voices.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                Alerts and read-backs fall back to each device’s built-in voice.
                {info.error && info.error !== 'signed-out' && (
                  <>
                    {' '}
                    The server said: <span className="font-medium text-ink">{info.error}</span>.
                  </>
                )}
              </p>
              <EnvList title="To enable" vars={ENV_SPEECH} />
            </>
          )}
        </IntegrationCard>

        {/* ── Email ───────────────────────────────────────────────────── */}
        <IntegrationCard
          icon={<Mail className="h-[18px] w-[18px]" />}
          title="Email"
          provider="Resend · magic links & invitations"
          health={health.email}
        >
          <p>
            {isDemo
              ? 'Demo mode doesn’t send email. On the connected deployment, magic-link sign-ins and officer invitations go out through Resend.'
              : 'Magic-link sign-ins and officer invitations are sent through Resend by the Supabase Send Email hook. These keys live on the server, so the dashboard can’t check them — send yourself a test invite to confirm.'}
          </p>
          <EnvList title="Server settings" vars={ENV_EMAIL} />
          <div>
            <p className="text-[12px] text-muted">Supabase → Authentication → Hooks → Send Email hook URL</p>
            <div className="mt-1 flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-surface-2 px-2 py-1.5 font-mono text-[12px] text-ink">
                {hookUrl}
              </code>
              <CopyButton value={hookUrl} label="Copy the hook URL" />
            </div>
          </div>
        </IntegrationCard>

        {/* ── Scanner bridge ──────────────────────────────────────────── */}
        <IntegrationCard
          icon={<RadioTower className="h-[18px] w-[18px]" />}
          title="Scanner transcription"
          provider="Self-hosted radio bridge"
          health={health.scanner}
        >
          {!RADIO_BRIDGE_ENABLED ? (
            <>
              <p>
                Optional. Connect the self-hosted radio-transcriptor bridge to merge live Memphis PD scanner transcriptions
                into the activity feed. The scanner audio plays without it.
              </p>
              <EnvList title="To enable" vars={ENV_SCANNER} />
            </>
          ) : (
            <>
              <DetailList
                items={[
                  { label: 'Bridge', value: WS_LABEL[wsStatus] },
                  { label: 'This session', value: plural(entries.length, 'transcription') },
                ]}
              />
              {health.scanner.state === 'warning' && (
                <p className="text-[12px] text-muted">
                  The bridge isn’t answering; the dashboard keeps retrying. Check that the transcriptor is running and
                  reachable from browsers (use <Mono>wss://</Mono> on HTTPS sites).
                </p>
              )}
            </>
          )}
        </IntegrationCard>
      </div>
    </div>
  );
}
