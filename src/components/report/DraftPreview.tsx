import { Car, Clock, MapPin, Sparkles, UserRound } from 'lucide-react';
import { categoryMeta } from '../../lib/taxonomy';
import { cn, shortAddress } from '../../lib/format';
import { subjectLine, vehicleLine } from '../../lib/incidentRows';
import { CategoryIcon, PriorityBadge } from '../incidents/Badges';
import { effectivePriority, type ReportDraft } from './draft';

function Line({ icon, label, value, placeholder, ai }: { icon: React.ReactNode; label: string; value?: string; placeholder: string; ai?: boolean }) {
  return (
    <div className="flex gap-3 py-2">
      <span className="mt-0.5 text-subtle">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
          {label}
          {ai && value && <Sparkles className="h-3 w-3 text-accent" aria-label="Filled by the interviewer" />}
        </p>
        <p className={cn('text-[13px] leading-snug', value ? 'text-ink' : 'italic text-subtle')}>{value || placeholder}</p>
      </div>
    </div>
  );
}

/** The report as it stands — fills in live while the interviewer works. */
export default function DraftPreview({ draft, live }: { draft: ReportDraft; live?: boolean }) {
  const ai = (f: string) => draft.aiFields.includes(f);
  const has = Boolean(draft.category || draft.description);
  const where = draft.place?.address ? shortAddress(draft.place.address) : draft.locationHint;
  const when = draft.occurredMode === 'earlier' && draft.occurredAt ? new Date(draft.occurredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : draft.whenHint || (draft.happeningNow ? 'Happening now' : '');

  return (
    <div className={cn('card overflow-hidden', live && has && 'shadow-glow')}>
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
          {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}
          Report draft
        </p>
        {draft.aiFields.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-strong">
            <Sparkles className="h-3.5 w-3.5" /> Filled by the interviewer
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {draft.category ? (
            <CategoryIcon category={draft.category} priority={effectivePriority(draft)} />
          ) : (
            <span className="skeleton h-10 w-10 rounded-xl" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.category && <PriorityBadge priority={effectivePriority(draft)} />}
              <span className="text-[12px] font-medium text-muted">{draft.category ? categoryMeta(draft.category).label : 'Category'}</span>
              {draft.happeningNow && <span className="rounded-md bg-red-600 px-1.5 text-[11px] font-semibold text-white">Now</span>}
            </div>
            <p className={cn('mt-0.5 text-[15px] font-semibold leading-snug', draft.title ? 'text-ink' : 'italic text-subtle')}>
              {draft.title || (live ? 'Listening…' : 'No headline yet')}
            </p>
          </div>
        </div>
        {draft.description && <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{draft.description}</p>}
        <div className="mt-2 divide-y divide-line">
          <Line icon={<MapPin className="h-4 w-4" />} label="Where" value={where} placeholder="Location not given yet" ai={ai('place')} />
          <Line icon={<Clock className="h-4 w-4" />} label="When" value={when} placeholder="Time not given yet" ai={ai('when')} />
          {draft.subjects.map((s, idx) => (
            <Line key={s.id} icon={<UserRound className="h-4 w-4" />} label={`Person ${idx + 1}`} value={subjectLine(s) || s.behavior} placeholder="—" ai={ai('subjects')} />
          ))}
          {draft.vehicles.map((v, idx) => (
            <Line key={v.id} icon={<Car className="h-4 w-4" />} label={`Vehicle ${idx + 1}`} value={vehicleLine(v)} placeholder="—" ai={ai('vehicles')} />
          ))}
        </div>
      </div>
    </div>
  );
}
