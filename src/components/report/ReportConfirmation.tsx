import { useEffect, useRef } from 'react';
import { CircleCheck, Eye, LayoutDashboard, MonitorDot, SquarePen, BellRing } from 'lucide-react';
import type { Incident } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { confirmationReadback } from '../../lib/announce';
import { categoryMeta } from '../../lib/taxonomy';
import { shortAddress } from '../../lib/format';
import { Button, ButtonLink } from '../ui/Button';
import ListenButton from '../voice/ListenButton';
import { PriorityBadge } from '../incidents/Badges';

/** "Sent" — the reference, what happens next, and an ElevenLabs read-back. */
export default function ReportConfirmation({ incident, onAnother }: { incident: Incident; onAnother: () => void }) {
  const { role } = useAuth();
  const { prefs, speak } = useVoice();
  const spoken = useRef(false);
  const officer = role === 'officer' || role === 'admin';

  useEffect(() => {
    if (spoken.current || !prefs.readBack || officer) return;
    spoken.current = true;
    void speak(confirmationReadback(incident), { key: `confirm-${incident.id}`, interrupt: true });
  }, [incident, prefs.readBack, officer, speak]);

  const steps = [
    { icon: CircleCheck, title: 'Received', body: 'Your report is on the Operations Center map now.' },
    { icon: Eye, title: 'An officer picks it up', body: 'Downtown public safety reviews and responds by priority.' },
    { icon: BellRing, title: 'You get updates', body: 'Status changes and notes show up on your dashboard.' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden text-center">
        <div className="bg-brand-night px-6 pb-8 pt-10 text-white">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-900/30">
            <CircleCheck className="h-9 w-9" />
          </span>
          <h2 className="mt-4 text-2xl font-bold tracking-tight">Report sent</h2>
          <p className="mt-1 text-sm text-navy-100">
            {categoryMeta(incident.category).label} near {shortAddress(incident.address) || 'the pinned location'}
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[13px]">
            <PriorityBadge priority={incident.priority} withLabel />
            <span className="font-mono font-semibold">{incident.ref}</span>
          </div>
        </div>
        <div className="px-6 py-6">
          <ol className="space-y-4 text-left">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex gap-3">
                  <span className={idx === 0 ? 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted'}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{s.title}</span>
                    <span className="block text-[13px] text-muted">{s.body}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <ListenButton text={confirmationReadback(incident)} speechKey={`confirm-${incident.id}`} label="Hear confirmation" size="md" />
            <ButtonLink to={officer ? '/ops' : '/home'} variant="secondary" icon={officer ? <MonitorDot className="h-4 w-4" /> : <LayoutDashboard className="h-4 w-4" />}>
              {officer ? 'Operations Center' : 'My dashboard'}
            </ButtonLink>
            <Button variant="ghost" icon={<SquarePen className="h-4 w-4" />} onClick={onAnother}>
              Report something else
            </Button>
          </div>
          <p className="mt-6 text-[12px] text-subtle">If anyone is in danger, call 911 — this dashboard does not dispatch emergency services.</p>
        </div>
      </div>
    </div>
  );
}
