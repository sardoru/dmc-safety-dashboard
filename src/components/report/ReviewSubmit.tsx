import { useEffect, useState } from 'react';
import { ArrowLeft, Send, Sparkles, Users } from 'lucide-react';
import type { CategoryKey, Incident, Priority, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import { useVoice } from '../../context/VoiceContext';
import { geocode } from '../../lib/geo';
import { CATEGORIES, PRIORITIES, PRIORITY_LIST, suggestPriority } from '../../lib/taxonomy';
import { cn } from '../../lib/format';
import LocationPicker from '../map/LocationPicker';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Field, Input, Select, Switch, Textarea } from '../ui/Form';
import EmergencyCallout from './EmergencyCallout';
import PeopleEditor from './PeopleEditor';
import PhotoPicker from './PhotoPicker';
import { draftToInput, effectivePriority, isEmergency, suggestedTitle, validateDraft, type ReportDraft } from './draft';

interface ReviewSubmitProps {
  draft: ReportDraft;
  setDraft: (fn: (d: ReportDraft) => ReportDraft) => void;
  profile: UserProfile | null;
  onBack: () => void;
  onSubmitted: (incident: Incident) => void;
}

function Block({ title, children, ai }: { title: string; children: React.ReactNode; ai?: boolean }) {
  return (
    <section className="border-t border-line px-4 py-5 first:border-t-0 sm:px-6">
      <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">
        {title}
        {ai && <Sparkles className="h-3.5 w-3.5 text-accent" aria-label="Filled in from your notes" />}
      </h3>
      {children}
    </section>
  );
}

export default function ReviewSubmit({ draft, setDraft, profile, onBack, onSubmitted }: ReviewSubmitProps) {
  const { role, displayName } = useAuth();
  const { createIncident } = useIncidents();
  const { unlock } = useVoice();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const officer = role === 'officer' || role === 'admin';
  const update = (patch: Partial<ReportDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const ai = (f: string) => draft.aiFields.includes(f);

  // A location the interviewer heard but nobody pinned: try to place it.
  const hint = draft.locationHint;
  const needsPin = !draft.place && Boolean(hint);
  useEffect(() => {
    if (!needsPin || !hint) return;
    let cancelled = false;
    void geocode(hint).then((p) => {
      if (!cancelled && p) setDraft((d) => (d.place ? d : { ...d, place: p }));
    });
    return () => {
      cancelled = true;
    };
  }, [needsPin, hint, setDraft]);

  const issues = validateDraft(draft);
  const priority = effectivePriority(draft);
  const suggested = draft.category ? suggestPriority(draft.category, draft) : null;

  const submit = async () => {
    unlock();
    if (issues.length) {
      setShowIssues(true);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const incident = await createIncident(
        draftToInput(draft, {
          source: officer ? 'officer' : 'business',
          reporterName: officer ? displayName : (profile?.businessName ?? displayName),
          businessId: officer ? undefined : profile?.id,
          contactPhone: officer ? undefined : profile?.phone,
        }),
      );
      onSubmitted(incident);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="card overflow-hidden">
        <Block title="What happened" ai={ai('category') || ai('description')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              {(id) => (
                <Select id={id} value={draft.category ?? ''} onChange={(e) => update({ category: (e.target.value || null) as CategoryKey | null })}>
                  <option value="">Choose…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Headline">
              {(id) => <Input id={id} value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder={suggestedTitle(draft)} />}
            </Field>
          </div>
          <Field label="Description" className="mt-4">
            {(id) => <Textarea id={id} rows={4} value={draft.description} onChange={(e) => update({ description: e.target.value })} placeholder="What did you see?" />}
          </Field>
          <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-surface-2 p-4 sm:grid-cols-3">
            <Switch size="sm" checked={draft.happeningNow} onChange={(v) => update({ happeningNow: v })} label="Happening now" />
            <Switch size="sm" checked={draft.weaponsSeen} onChange={(v) => update({ weaponsSeen: v })} label="Weapon seen" />
            <Switch size="sm" checked={draft.injuries} onChange={(v) => update({ injuries: v })} label="Someone hurt" />
          </div>
        </Block>

        <Block title="Where" ai={ai('place')}>
          {hint && (
            <p className="mb-2 text-[13px] text-muted">
              You said: <span className="font-medium text-ink">“{hint}”</span>
              {!draft.place && ' — finding it on the map…'}
            </p>
          )}
          <LocationPicker
            value={draft.place}
            onChange={(place) => update({ place })}
            business={profile ? { lat: profile.lat, lng: profile.lng, address: profile.address, name: profile.businessName } : null}
          />
          <Field label="Exact spot" optional className="mt-3">
            {(id) => <Input id={id} value={draft.locationNote} onChange={(e) => update({ locationNote: e.target.value })} placeholder="e.g. alley behind the store" />}
          </Field>
        </Block>

        <Block title={`People & vehicles · ${draft.subjects.length + draft.vehicles.length}`} ai={ai('subjects') || ai('vehicles')}>
          <PeopleEditor subjects={draft.subjects} vehicles={draft.vehicles} onSubjects={(subjects) => update({ subjects })} onVehicles={(vehicles) => update({ vehicles })} />
        </Block>

        <Block title="Photos">
          <PhotoPicker files={draft.photos} onChange={(photos) => update({ photos })} />
        </Block>
      </div>

      {/* Sidebar: priority, sharing, send */}
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        {isEmergency(draft) && <EmergencyCallout loud />}
        <div className="card p-5">
          <p className="label">How urgent is it?</p>
          <div className="grid grid-cols-2 gap-2">
            {PRIORITY_LIST.map((p: Priority) => (
              <button
                key={p}
                type="button"
                onClick={() => update({ priority: p, priorityTouched: true })}
                className={cn(
                  'rounded-xl border px-3 py-2 text-left transition-colors',
                  priority === p ? 'border-accent bg-accent-soft/70 ring-1 ring-[var(--accent)]' : 'border-line hover:bg-surface-2',
                )}
                aria-pressed={priority === p}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITIES[p].hex }} />
                  {PRIORITIES[p].short} · {PRIORITIES[p].label}
                </span>
                {suggested === p && <span className="mt-0.5 block text-[11px] font-semibold text-accent-strong">Suggested</span>}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted">{PRIORITIES[priority].description}.</p>

          <div className="mt-5 space-y-4 border-t border-line pt-4">
            <Switch
              checked={draft.shareWithBusinesses}
              onChange={(v) => update({ shareWithBusinesses: v })}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-muted" /> Alert nearby businesses
                </span>
              }
              description="Others downtown see the category, location and description — never your photos or contact details."
            />
            {!officer && (
              <Switch
                checked={draft.contactOk}
                onChange={(v) => update({ contactOk: v })}
                label="Officers may contact me"
                description={profile?.phone ? `They’ll call ${profile.phone}.` : 'Add a phone number in Settings.'}
              />
            )}
          </div>
        </div>

        {showIssues && issues.length > 0 && (
          <Banner tone="warning" title="A couple of things first">
            <ul className="list-disc pl-4">
              {issues.map((i) => (
                <li key={i.field}>{i.message}</li>
              ))}
            </ul>
          </Banner>
        )}
        {error && <Banner tone="danger">{error}</Banner>}

        <Button block size="xl" variant={priority <= 2 ? 'danger' : 'primary'} icon={<Send className="h-5 w-5" />} loading={submitting} onClick={() => void submit()}>
          Send to officers
        </Button>
        <Button block variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}
