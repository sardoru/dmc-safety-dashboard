import { useMemo, useState } from 'react';
import { Check, Search, Volume2 } from 'lucide-react';
import { useVoice } from '../../context/VoiceContext';
import { cn } from '../../lib/format';
import { Banner } from '../ui/Feedback';
import { Input } from '../ui/Form';
import ListenButton from './ListenButton';

const SAMPLE =
  'New report. Priority two, suspicious person near South Main Street and Beale Street. A man in a gray hoodie trying car door handles, heading south.';

/** Pick the ElevenLabs voice used for alerts, briefings and read-backs. */
export default function VoicePicker() {
  const { info, prefs, setPrefs } = useVoice();
  const [query, setQuery] = useState('');
  const selected = prefs.voiceId ?? info.defaultVoiceId ?? null;

  const voices = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = info.voices;
    if (!q) return list.slice(0, 40);
    return list
      .filter((v) => [v.name, v.description, v.accent, v.gender, v.useCase].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 40);
  }, [info.voices, query]);

  if (!info.configured) {
    return (
      <Banner tone="info" title="Voices">
        {info.loading
          ? 'Checking the voice service…'
          : info.error === 'demo'
            ? 'Demo mode uses your browser’s built-in voice. On the live dashboard, alerts and briefings are spoken in the natural voice you pick here.'
            : 'Natural voices aren’t set up on this deployment yet. Speech uses your browser’s voice for now.'}
      </Banner>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search voices — calm, British, narrator…" className="pl-9" />
        </div>
      </div>
      {info.voiceSource === 'curated' && <p className="mb-2 text-[12px] text-subtle">Showing the standard voice set</p>}
      <ul className="scrollbar-thin max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {voices.map((v) => {
          const active = v.id === selected;
          return (
            <li key={v.id}>
              <div
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                  active ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                <button type="button" onClick={() => setPrefs({ voiceId: v.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
                      active ? 'bg-primary text-primary-ink' : 'bg-surface-3 text-muted',
                    )}
                  >
                    {active ? <Check className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{v.name}</span>
                    <span className="block truncate text-[12px] text-muted">
                      {[v.description, v.accent, v.gender].filter(Boolean).join(' · ') || v.category || 'Voice'}
                    </span>
                  </span>
                </button>
                <ListenButton variant="icon" text={SAMPLE} speechKey={`sample-${v.id}`} voiceId={v.id} label={`Preview ${v.name}`} />
              </div>
            </li>
          );
        })}
      </ul>
      {prefs.voiceId && (
        <button type="button" onClick={() => setPrefs({ voiceId: null })} className="mt-2 text-[12px] font-medium text-muted hover:text-ink hover:underline">
          Use the deployment default voice
        </button>
      )}
    </div>
  );
}
