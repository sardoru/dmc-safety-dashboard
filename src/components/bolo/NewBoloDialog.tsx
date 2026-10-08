import { useId, useMemo, useState, type FormEvent } from 'react';
import { Car, CopyPlus, Megaphone, Search, ShieldCheck, UserSearch } from 'lucide-react';
import type { Incident } from '../../types';
import { useBolos } from '../../context/BoloContext';
import { useIncidents } from '../../context/IncidentContext';
import { useToast } from '../../context/ToastContext';
import { bumpNow, useNow } from '../../hooks/useNow';
import { cn, shortAddress, timeAgo } from '../../lib/format';
import { categoryMeta } from '../../lib/taxonomy';
import { Dialog } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Field, Input, Segmented, Select, Textarea } from '../ui/Form';
import { PriorityBadge } from '../incidents/Badges';
import {
  buildBoloInput,
  EMPTY_PERSON,
  EMPTY_VEHICLE,
  EXPIRY_OPTIONS,
  hasPersonDetail,
  hasVehicleDetail,
  mergePerson,
  mergeVehicle,
  PERSON_FIELDS,
  VEHICLE_FIELDS,
  withCurrent,
  type ExpiryValue,
  type FieldSpec,
  type PersonFields,
  type VehicleFields,
} from './boloUtils';

type Kind = 'person' | 'vehicle';
type Errors = Partial<Record<'title' | 'summary' | 'details', string>>;

const RECENT_DAYS = 30;
const RECENT_LIMIT = 40;

function DescriptionFields<K extends string>({
  specs,
  values,
  onChange,
}: {
  specs: FieldSpec<K>[];
  values: Record<K, string>;
  onChange: (key: K, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {specs.map((f) => (
        <Field key={f.key} label={f.label} className={f.wide ? 'sm:col-span-2' : undefined}>
          {(id) =>
            f.options ? (
              <Select id={id} value={values[f.key]} onChange={(e) => onChange(f.key, e.target.value)}>
                {withCurrent(f.options, values[f.key]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id={id}
                value={values[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                maxLength={f.maxLength ?? 120}
                autoComplete="off"
              />
            )
          }
        </Field>
      ))}
    </div>
  );
}

function hasDescriptionFor(i: Incident, kind: Kind): boolean {
  return kind === 'vehicle' ? i.vehicles.length > 0 : i.subjects.length > 0;
}

export default function NewBoloDialog({ onClose }: { onClose: () => void }) {
  const { createBolo } = useBolos();
  const { incidents } = useIncidents();
  const { push } = useToast();
  const now = useNow();
  const formId = useId();
  const listId = useId();

  const [kind, setKind] = useState<Kind>('person');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [person, setPerson] = useState<PersonFields>(EMPTY_PERSON);
  const [vehicle, setVehicle] = useState<VehicleFields>(EMPTY_VEHICLE);
  const [expiry, setExpiry] = useState<ExpiryValue>('7');
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const recent = useMemo(
    () => incidents.filter((i) => now - i.createdAt <= RECENT_DAYS * 86_400_000).slice(0, RECENT_LIMIT),
    [incidents, now],
  );
  const q = query.trim().toLowerCase();
  const visible = q
    ? recent.filter((i) =>
        [i.title, i.ref, i.address, categoryMeta(i.category).short].some((s) => s.toLowerCase().includes(q)),
      )
    : recent;
  const linked = linkedIds
    .map((id) => incidents.find((i) => i.id === id))
    .filter((i): i is Incident => Boolean(i));
  const latestLinked = [...linked].sort((a, b) => b.occurredAt - a.occurredAt)[0];

  const toggle = (id: string) =>
    setLinkedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const copyFrom = (i: Incident) => {
    if (kind === 'vehicle' && i.vehicles[0]) setVehicle((v) => mergeVehicle(v, i.vehicles[0]));
    if (kind === 'person' && i.subjects[0]) setPerson((p) => mergePerson(p, i.subjects[0]));
    setErrors((e) => ({ ...e, details: undefined }));
    push({ tone: 'info', title: 'Description copied', body: `Filled the empty fields from ${i.ref}. Check them before posting.` });
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (title.trim().length < 4) next.title = 'Give the notice a short, specific title.';
    if (summary.trim().length < 10) next.summary = 'Add a sentence on what happened and what to watch for.';
    if (kind === 'person' && !hasPersonDetail(person)) {
      next.details = 'Add at least one detail people can spot — clothing, build or a distinctive item.';
    }
    if (kind === 'vehicle' && !hasVehicleDetail(vehicle)) {
      next.details = 'Add at least one vehicle detail — color, make, model or plate.';
    }
    return next;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const bolo = await createBolo(buildBoloInput({ kind, title, summary, person, vehicle, expiry, linked }));
      bumpNow();
      push({
        tone: 'success',
        title: 'Lookout posted',
        body: `“${bolo.title}” is on the board. Downtown businesses can see it and report sightings.`,
      });
      onClose();
    } catch (err) {
      setSaving(false);
      push({
        tone: 'danger',
        title: 'Couldn’t post the lookout',
        body: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<Megaphone className="h-5 w-5" />}
      title="New BOLO"
      description="Post a be-on-the-lookout notice. Every signed-in downtown business sees active notices."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving} icon={<Megaphone className="h-4 w-4" aria-hidden />}>
            Post lookout
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="space-y-5"
        onKeyDown={(e) => {
          // A notice goes to every business — only post from the button, never from Enter in a field.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
        }}
      >
        <div>
          <p className="label">Looking for a</p>
          <Segmented<Kind>
            label="Notice type"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setErrors((er) => ({ ...er, details: undefined }));
            }}
            options={[
              { value: 'person', label: 'Person', icon: <UserSearch className="h-4 w-4" aria-hidden /> },
              { value: 'vehicle', label: 'Vehicle', icon: <Car className="h-4 w-4" aria-hidden /> },
            ]}
          />
        </div>

        <Field label="Title" error={errors.title}>
          {(id) => (
            <Input
              id={id}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === 'vehicle' ? 'e.g. Silver sedan — vehicle break-ins' : 'e.g. Repeat shoplifter — South Main corridor'}
              maxLength={90}
              aria-invalid={Boolean(errors.title)}
            />
          )}
        </Field>

        <Field
          label="Summary"
          error={errors.summary}
          hint="What happened, any pattern, and what businesses should do if they see it."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Linked to three thefts along Main St. Conceals merchandise in a large tote. Don’t confront — report the sighting."
              maxLength={600}
              aria-invalid={Boolean(errors.summary)}
            />
          )}
        </Field>

        <fieldset className="space-y-3">
          <legend className="label">{kind === 'vehicle' ? 'Vehicle description' : 'Description'}</legend>
          <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <ShieldCheck className="mt-px h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
            {kind === 'vehicle'
              ? 'Stick to what anyone can see and check: color, make, model, plate, damage.'
              : 'Stick to what anyone can see and check: clothing, build, carried items and behavior. Don’t include race or ethnicity.'}
          </p>
          {errors.details && <p className="text-xs font-medium text-red-600 dark:text-red-400">{errors.details}</p>}
          {kind === 'person' ? (
            <DescriptionFields
              specs={PERSON_FIELDS}
              values={person}
              onChange={(key, value) => setPerson((p) => ({ ...p, [key]: value }))}
            />
          ) : (
            <DescriptionFields
              specs={VEHICLE_FIELDS}
              values={vehicle}
              onChange={(key, value) => setVehicle((v) => ({ ...v, [key]: key === 'plateState' ? value.toUpperCase() : value }))}
            />
          )}
        </fieldset>

        <div>
          <p className="label">Expires in</p>
          <Segmented<ExpiryValue>
            label="Expires in"
            value={expiry}
            onChange={setExpiry}
            options={EXPIRY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <p className="mt-1.5 text-xs text-muted">You can extend or clear it from the board at any time.</p>
        </div>

        <fieldset>
          <legend className="label">
            Link recent reports <span className="ml-1 font-normal text-subtle">(optional)</span>
            {linked.length > 0 && <span className="ml-2 font-semibold text-accent-strong">{linked.length} selected</span>}
          </legend>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, reference or street"
              aria-label="Filter recent reports"
              aria-controls={listId}
              className="pl-9"
            />
          </div>
          <ul
            id={listId}
            className="scrollbar-thin max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line"
          >
            {visible.length === 0 && (
              <li className="px-3 py-4 text-center text-[13px] text-muted">
                {recent.length ? 'No reports match that filter.' : `No reports in the last ${RECENT_DAYS} days.`}
              </li>
            )}
            {visible.map((i) => {
              const checked = linkedIds.includes(i.id);
              const boxId = `${listId}-${i.id}`;
              return (
                <li key={i.id} className={cn('flex items-start gap-3 px-3 py-2.5', checked && 'bg-accent-soft/50')}>
                  <input
                    id={boxId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(i.id)}
                    className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
                  />
                  <label htmlFor={boxId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="flex items-center gap-1.5">
                      <PriorityBadge priority={i.priority} />
                      <span className="truncate text-[13px] font-medium text-ink">{i.title}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted">
                      {i.ref} · {timeAgo(i.createdAt, now)}
                      {i.address ? ` · ${shortAddress(i.address)}` : ''}
                    </span>
                  </label>
                  {checked && hasDescriptionFor(i, kind) && (
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={<CopyPlus className="h-3.5 w-3.5" aria-hidden />}
                      onClick={() => copyFrom(i)}
                      title={`Fill empty description fields from ${i.ref}`}
                    >
                      Use description
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            {latestLinked
              ? `“Last seen” will be set from ${latestLinked.ref}: ${shortAddress(latestLinked.address) || 'its location'}, ${timeAgo(latestLinked.occurredAt, now)}.`
              : 'Linked reports show up on the notice, and the most recent one sets “last seen”.'}
          </p>
        </fieldset>
      </form>
    </Dialog>
  );
}
