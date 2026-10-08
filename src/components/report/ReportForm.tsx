import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Mic, Square, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import type { UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useVoice } from '../../context/VoiceContext';
import { useToast } from '../../context/ToastContext';
import { useDictation } from '../../hooks/useDictation';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import { geocode } from '../../lib/geo';
import { categoryMeta } from '../../lib/taxonomy';
import { cn } from '../../lib/format';
import type { CapturedReport } from '../../lib/live';
import LocationPicker from '../map/LocationPicker';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Field, Input, Segmented, Switch, Textarea } from '../ui/Form';
import CategoryGrid from './CategoryGrid';
import EmergencyCallout from './EmergencyCallout';
import PeopleEditor from './PeopleEditor';
import PhotoPicker from './PhotoPicker';
import { isEmergency, mergeCapture, suggestedTitle, toLocalInput, type ReportDraft } from './draft';

type Step = 'what' | 'where' | 'when' | 'who' | 'details';

const STEPS: { key: Step; label: string; question: string; prompt: string }[] = [
  {
    key: 'what',
    label: 'What',
    question: 'What’s going on?',
    prompt: 'What’s going on? Pick the option that fits best. If anyone is in danger, call 9 1 1 first.',
  },
  {
    key: 'where',
    label: 'Where',
    question: 'Where is it happening?',
    prompt: 'Where is it happening? Drop a pin on the map, or tap your business if it is right there.',
  },
  { key: 'when', label: 'When', question: 'When did it happen?', prompt: 'When did it happen? Is it happening now, or was it earlier?' },
  {
    key: 'who',
    label: 'Who',
    question: 'Who or what did you see?',
    prompt: 'Describe anyone involved. Focus on what they did, their clothing, and which way they went. Add a vehicle if there was one.',
  },
  {
    key: 'details',
    label: 'Details',
    question: 'Anything else officers should know?',
    prompt: 'Anything else officers should know? Add a short summary, and photos if it is safe to take them.',
  },
];

interface ReportFormProps {
  draft: ReportDraft;
  setDraft: (fn: (d: ReportDraft) => ReportDraft) => void;
  profile: UserProfile | null;
  onReview: () => void;
}

export default function ReportForm({ draft, setDraft, profile, onReview }: ReportFormProps) {
  const { isDemo } = useAuth();
  const { prefs, setPrefs, speak, stop, unlock } = useVoice();
  const { push } = useToast();
  const now = useNow();
  const [step, setStep] = useState<Step>('what');
  const [organizing, setOrganizing] = useState(false);
  const idx = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[idx];

  const dictation = useDictation((text) =>
    setDraft((d) => ({ ...d, description: d.description ? `${d.description.trim()} ${text}` : text })),
  );

  // Voice guide: read each step's question with the ElevenLabs voice.
  useEffect(() => {
    if (!prefs.guide) return;
    void speak(current.prompt, { key: `guide-${current.key}`, cache: true, interrupt: true });
  }, [current, prefs.guide, speak]);

  const update = (patch: Partial<ReportDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const meta = draft.category ? categoryMeta(draft.category) : null;

  const canNext = step === 'what' ? Boolean(draft.category) : step === 'where' ? Boolean(draft.place) : true;
  const next = () => {
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
    else {
      stop();
      onReview();
    }
  };
  const back = () => idx > 0 && setStep(STEPS[idx - 1].key);

  const organize = async () => {
    if (!draft.description.trim()) return;
    setOrganizing(true);
    try {
      const r = await apiFetch<CapturedReport & { structured?: boolean }>('/api/reports/extract', {
        method: 'POST',
        json: { transcript: draft.description },
      });
      let place = draft.place;
      if (!place && r.location_hint) place = await geocode(r.location_hint);
      setDraft((d) => {
        const merged = mergeCapture(d, { ...r, description: r.description || d.description }, profile);
        return { ...merged, place: d.place ?? place ?? merged.place };
      });
      push({ title: r.structured ? 'Organized with AI' : 'Saved your description', body: r.structured ? 'Check the category, people and vehicles it found.' : undefined, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t organize the description', body: err instanceof Error ? err.message : undefined, tone: 'warning' });
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Stepper */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
        <ol className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar" aria-label="Report steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => i <= idx && setStep(s.key)}
                disabled={i > idx}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors',
                  i === idx ? 'bg-primary text-primary-ink' : i < idx ? 'text-ink hover:bg-surface-3' : 'text-subtle',
                )}
                aria-current={i === idx ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                    i < idx ? 'bg-emerald-500 text-white' : i === idx ? 'bg-primary-ink/20' : 'bg-surface-3',
                  )}
                >
                  {i < idx ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                {s.label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-3 bg-line-strong" />}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => {
            unlock();
            if (prefs.guide) stop();
            setPrefs({ guide: !prefs.guide });
          }}
          className={cn(
            'inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold transition-colors',
            prefs.guide ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:text-ink',
          )}
          title="Read each question aloud (ElevenLabs voice)"
        >
          {prefs.guide ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Read aloud</span>
        </button>
      </div>

      <div className="px-4 py-6 sm:px-8">
        <h2 className="text-xl font-bold tracking-tight text-ink">{current.question}</h2>

        {step === 'what' && (
          <div className="mt-5 space-y-5">
            <CategoryGrid value={draft.category} onChange={(category) => update({ category })} />
            <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
              <Switch checked={draft.happeningNow} onChange={(v) => update({ happeningNow: v })} label="It’s happening right now" description="The person or activity is still there." />
              <Switch checked={draft.weaponsSeen} onChange={(v) => update({ weaponsSeen: v })} label="I saw a weapon" />
              <Switch checked={draft.injuries} onChange={(v) => update({ injuries: v })} label="Someone is hurt" />
            </div>
            <EmergencyCallout loud={isEmergency(draft)} />
          </div>
        )}

        {step === 'where' && (
          <div className="mt-5 space-y-4">
            {draft.locationHint && !draft.place && (
              <Banner tone="info" title="The interviewer heard">
                “{draft.locationHint}” — pin it on the map so officers can find it.
              </Banner>
            )}
            <LocationPicker
              value={draft.place}
              onChange={(place) => update({ place })}
              business={profile ? { lat: profile.lat, lng: profile.lng, address: profile.address, name: profile.businessName } : null}
            />
            <Field label="Exact spot" optional hint="e.g. back alley door, level 3 of the garage, bus shelter">
              {(id) => <Input id={id} value={draft.locationNote} onChange={(e) => update({ locationNote: e.target.value })} placeholder="Where exactly?" />}
            </Field>
          </div>
        )}

        {step === 'when' && (
          <div className="mt-5 space-y-4">
            <Segmented
              label="When"
              value={draft.occurredMode}
              onChange={(m) => update({ occurredMode: m, occurredAt: m === 'earlier' && !draft.occurredAt ? toLocalInput(Date.now() - 30 * 60_000) : draft.occurredAt })}
              options={[
                { value: 'now', label: 'Just now / ongoing' },
                { value: 'earlier', label: 'Earlier' },
              ]}
            />
            {draft.occurredMode === 'earlier' && (
              <Field label="Date and time" hint="Your best estimate is fine.">
                {(id) => (
                  <Input id={id} type="datetime-local" value={draft.occurredAt} max={toLocalInput(now)} onChange={(e) => update({ occurredAt: e.target.value })} className="max-w-xs" />
                )}
              </Field>
            )}
            {draft.whenHint && <p className="text-[13px] text-muted">The interviewer noted: “{draft.whenHint}”.</p>}
          </div>
        )}

        {step === 'who' && (
          <div className="mt-5 space-y-4">
            <Banner tone="info" title="Describe behavior and clothing">
              Officers act on what someone did and how to recognize them — clothing, build, anything distinctive, direction of travel. Please don’t describe someone by race or ethnicity alone.
            </Banner>
            <PeopleEditor
              subjects={draft.subjects}
              vehicles={draft.vehicles}
              onSubjects={(subjects) => update({ subjects })}
              onVehicles={(vehicles) => update({ vehicles })}
              people={meta?.asksPeople ?? true}
              cars={meta?.asksVehicles ?? true}
            />
            {!draft.subjects.length && !draft.vehicles.length && <p className="text-[13px] text-subtle">Nobody specific? That’s fine — continue.</p>}
          </div>
        )}

        {step === 'details' && (
          <div className="mt-5 space-y-5">
            <Field label="Headline" hint="A few words officers will see first.">
              {(id) => <Input id={id} value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder={suggestedTitle(draft)} maxLength={120} />}
            </Field>
            <Field label="What happened" hint="Plain words are best: what you saw, what was taken or damaged, whether there’s camera footage.">
              {(id) => (
                <div>
                  <Textarea id={id} rows={5} value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="e.g. A man in a gray hoodie was pulling on car door handles along 2nd St, then walked south toward Peabody Place." />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {!isDemo && (
                      <Button
                        size="sm"
                        variant={dictation.state === 'recording' ? 'danger' : 'secondary'}
                        icon={dictation.state === 'transcribing' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : dictation.state === 'recording' ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
                        onClick={dictation.toggle}
                        disabled={dictation.state === 'transcribing'}
                      >
                        {dictation.state === 'recording' ? 'Stop & transcribe' : dictation.state === 'transcribing' ? 'Transcribing…' : 'Dictate'}
                      </Button>
                    )}
                    {!isDemo && (
                      <Button size="sm" variant="ghost" icon={<WandSparkles className="h-4 w-4" />} loading={organizing} disabled={!draft.description.trim()} onClick={() => void organize()}>
                        Organize with AI
                      </Button>
                    )}
                    {dictation.error && <span className="text-[12px] text-red-600 dark:text-red-400">{dictation.error}</span>}
                  </div>
                </div>
              )}
            </Field>
            <div>
              <p className="label">Photos <span className="font-normal text-subtle">(optional)</span></p>
              <PhotoPicker files={draft.photos} onChange={(photos) => update({ photos })} />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-4 py-3.5 sm:px-8">
        <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={back} disabled={idx === 0}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          {step === 'who' && (
            <Button variant="ghost" onClick={next}>
              Skip
            </Button>
          )}
          <Button iconRight={<ArrowRight className="h-4 w-4" />} onClick={next} disabled={!canNext}>
            {idx === STEPS.length - 1 ? 'Review report' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
