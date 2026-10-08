import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bell, BellOff, BellRing, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVoice } from '../../context/VoiceContext';
import { cn } from '../../lib/format';
import { PRIORITIES, PRIORITY_LIST, toPriority } from '../../lib/taxonomy';
import type { Priority } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Segmented, Switch } from '../ui/Form';
import ListenButton from '../voice/ListenButton';
import VoicePicker from '../voice/VoicePicker';
import { useNotificationPermission, type NotificationState } from './useNotificationPermission';

type Level = '1' | '2' | '3' | '4';

const LEVELS: { value: Level; label: string }[] = [
  { value: '1', label: 'P1 only' },
  { value: '2', label: 'P1–P2' },
  { value: '3', label: 'P1–P3' },
  { value: '4', label: 'All' },
];

function levelHint(min: Priority): string {
  if (min === 4) return 'Every new report is read aloud, including low-priority ones.';
  const names = PRIORITY_LIST.filter((p) => p <= min).map((p) => PRIORITIES[p].label.toLowerCase());
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Reads out ${list} reports. Everything else still chimes and shows a notice.`;
}

const STAFF_SAMPLE =
  'New report. Priority two. Suspicious person near South Main Street and Beale Street. A man in a gray hoodie is trying car door handles, heading south.';
const BUSINESS_SAMPLE =
  'Safety alert nearby. Priority two, suspicious person about a block from your storefront, near South Main Street and Beale Street.';

const NOTIFY: Record<NotificationState, { icon: LucideIcon; status: string; body: string; tone: string }> = {
  granted: {
    icon: BellRing,
    status: 'On',
    body: 'New reports pop up as system notifications while the dashboard is in the background.',
    tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  },
  default: {
    icon: Bell,
    status: 'Off',
    body: 'Get a system notification for new reports when the dashboard is in the background.',
    tone: 'bg-surface-3 text-muted',
  },
  denied: {
    icon: BellOff,
    status: 'Blocked',
    body: 'Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.',
    tone: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
  },
  unsupported: {
    icon: BellOff,
    status: 'Unavailable',
    body: 'This browser doesn’t support notifications. On iPhone, add the dashboard to your Home Screen first.',
    tone: 'bg-surface-3 text-muted',
  },
};

function NotificationRow() {
  const { permission, request } = useNotificationPermission();
  const { push } = useToast();
  const view = NOTIFY[permission];
  const Icon = view.icon;

  const ask = async () => {
    const result = await request();
    if (result === 'granted') {
      push({ title: 'Notifications are on', body: 'You’ll be notified about new reports while the dashboard is in the background.', tone: 'success' });
    } else if (result === 'denied') {
      push({ title: 'Notifications blocked', body: 'Allow notifications for this site in your browser settings to turn them on.', tone: 'warning' });
    }
  };

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-2">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">Desktop notifications</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{view.body}</p>
      </div>
      {permission === 'default' ? (
        <Button size="sm" variant="secondary" onClick={() => void ask()} className="flex-shrink-0">
          Turn on
        </Button>
      ) : (
        <span className={cn('inline-flex h-6 flex-shrink-0 items-center rounded-full px-2.5 text-[12px] font-semibold', view.tone)}>
          {view.status}
        </span>
      )}
    </div>
  );
}

/** Spoken alerts, read-backs, notifications and the ElevenLabs voice. */
export default function VoiceAlertsCard() {
  const { role } = useAuth();
  const { prefs, setPrefs, unlock, audioReady, voiceLabel } = useVoice();
  const voiceHeadingId = useId();
  const staff = role === 'officer' || role === 'admin';

  const toggleAlerts = (on: boolean) => {
    // The switch click is a user gesture, so this also unlocks audio playback.
    if (on) unlock();
    setPrefs({ alerts: on });
  };

  return (
    <Card>
      <CardHeader
        icon={<Volume2 className="h-[18px] w-[18px]" />}
        title="Voice & alerts"
        subtitle="What the dashboard says out loud, and when."
      />

      <div className="space-y-5">
        <Switch
          checked={prefs.alerts}
          onChange={toggleAlerts}
          label="Speak new reports aloud"
          description={
            staff
              ? 'Read new reports out loud as they arrive, right after the chime.'
              : 'Read out reports within half a mile of your storefront and updates on reports you filed.'
          }
        />

        {prefs.alerts && !audioReady && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
            <p className="flex min-w-0 items-start gap-2 text-[13px] leading-snug text-muted">
              <VolumeX className="mt-px h-4 w-4 flex-shrink-0 text-subtle" aria-hidden />
              Sound stays paused until you interact with the page.
            </p>
            <Button size="xs" variant="secondary" onClick={unlock} className="flex-shrink-0">
              Enable sound
            </Button>
          </div>
        )}

        <fieldset disabled={!prefs.alerts} className="min-w-0 transition-opacity disabled:opacity-50">
          <legend className="text-[13px] font-semibold text-ink-2">Announce priority</legend>
          <div className="mt-2">
            <Segmented
              value={String(prefs.minPriority) as Level}
              onChange={(v) => setPrefs({ minPriority: toPriority(v, prefs.minPriority) })}
              options={LEVELS}
              label="Announce priority"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              {prefs.alerts ? levelHint(prefs.minPriority) : 'Turn on spoken reports to choose which priorities are read out.'}
            </p>
          </div>
        </fieldset>

        <div className="space-y-4 border-t border-line pt-5">
          <Switch
            checked={prefs.readBack}
            onChange={(v) => setPrefs({ readBack: v })}
            label="Read my report back after I submit"
            description="Hear a short confirmation with your reference number."
          />
          <Switch
            checked={prefs.guide}
            onChange={(v) => setPrefs({ guide: v })}
            label="Read the report form’s questions aloud"
            description="Helpful when your hands or eyes are busy."
          />
        </div>

        <div className="border-t border-line pt-5">
          <NotificationRow />
        </div>

        <section aria-labelledby={voiceHeadingId} className="border-t border-line pt-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 id={voiceHeadingId} className="text-sm font-semibold text-ink">
                Voice
              </h4>
              <p className="mt-0.5 truncate text-[12px] text-muted">Now using {voiceLabel}</p>
            </div>
            <ListenButton
              text={staff ? STAFF_SAMPLE : BUSINESS_SAMPLE}
              speechKey="account-voice-test"
              label="Test"
              className="flex-shrink-0"
            />
          </div>
          <VoicePicker />
          <p className="mt-3 text-[12px] leading-relaxed text-subtle">
            Speech uses a natural voice and falls back to your browser’s built-in voice when it isn’t available.
          </p>
        </section>
      </div>
    </Card>
  );
}
