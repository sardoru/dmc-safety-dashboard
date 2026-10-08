import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { MapPinned, Store } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast, type ToastInput } from '../../context/ToastContext';
import { DOWNTOWN_CENTER, geocode } from '../../lib/geo';
import { generateId, shortAddress } from '../../lib/format';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Skeleton } from '../ui/Feedback';
import { Field, Input, Select } from '../ui/Form';
import { BUSINESS_TYPES, isBusinessType } from './businessTypes';
import {
  blankForm,
  formFromProfile,
  hasPin,
  sameAddress,
  trimForm,
  validateForm,
  type StorefrontErrors,
  type StorefrontForm,
} from './storefront';
import { messageOf } from './util';

/** What happened to the map pin on save. */
type PinOutcome = 'unchanged' | 'located' | 'kept' | 'approximate';

function savedToast(created: boolean, pin: PinOutcome, address: string, demo: boolean): ToastInput {
  const where = shortAddress(address) || address;
  const local = demo ? ' Saved in this browser (demo).' : '';
  if (pin === 'approximate') {
    return {
      title: created ? 'Storefront registered — approximate pin' : 'Saved — approximate pin',
      body: `We couldn’t find “${where}” on the map, so you’re pinned at the center of downtown for now. Add the street number and save again.${local}`,
      tone: 'warning',
    };
  }
  if (pin === 'kept') {
    return {
      title: 'Saved — map pin unchanged',
      body: `We couldn’t find “${where}” on the map, so your pin stays where it was. Check the street number and try again.${local}`,
      tone: 'warning',
    };
  }
  if (created) {
    return {
      title: 'Storefront registered',
      body: `You’ll get alerts for reports within half a mile of ${where}.${local}`,
      tone: 'success',
    };
  }
  return {
    title: 'Storefront saved',
    body: (pin === 'located' ? `Your map pin now points to ${where}.` : 'Your details are up to date.') + local,
    tone: 'success',
  };
}

/** Business accounts: create or edit the storefront officers see on the map. */
export default function StorefrontCard() {
  const { isDemo, profile: account, email } = useAuth();
  const { profile, setProfile, loading } = useProfile();
  const { push } = useToast();

  const [draft, setDraft] = useState<StorefrontForm | null>(null);
  const [errors, setErrors] = useState<StorefrontErrors>({});
  const [phase, setPhase] = useState<'locating' | 'saving' | null>(null);

  const creating = !profile;
  const base = profile
    ? formFromProfile(profile)
    : blankForm({ contactName: account?.display_name ?? '', email: email ?? '' });
  const form = draft ?? base;

  const update = <K extends keyof StorefrontForm>(key: K, value: StorefrontForm[K]) => {
    setDraft((prev) => ({ ...(prev ?? base), [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const discard = () => {
    setDraft(null);
    setErrors({});
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const next = trimForm(form);
    const found = validateForm(next);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const previous = profile;
    const hadPin = hasPin(previous);
    const addressChanged = !previous || !sameAddress(previous.address, next.address);
    let lat = previous?.lat ?? DOWNTOWN_CENTER[0];
    let lng = previous?.lng ?? DOWNTOWN_CENTER[1];
    let pin: PinOutcome = 'unchanged';

    try {
      if (addressChanged || !hadPin) {
        setPhase('locating');
        const place = await geocode(next.address);
        if (place) {
          lat = place.lat;
          lng = place.lng;
          pin = 'located';
        } else if (hadPin) {
          pin = 'kept';
        } else {
          [lat, lng] = DOWNTOWN_CENTER;
          pin = 'approximate';
        }
      }
      setPhase('saving');
      await setProfile({
        id: previous?.id ?? generateId(),
        ...next,
        lat,
        lng,
        registeredAt: previous?.registeredAt ?? Date.now(),
      });
      setDraft(null);
      setErrors({});
      push(savedToast(creating, pin, next.address, isDemo));
    } catch (err) {
      push({
        title: 'Couldn’t save your storefront',
        body: messageOf(err, 'Please check your connection and try again.'),
        tone: 'danger',
      });
    } finally {
      setPhase(null);
    }
  };

  const busy = phase !== null;

  if (loading && !profile) {
    return (
      <Card aria-busy="true">
        <CardHeader icon={<Store className="h-[18px] w-[18px]" />} title="Business storefront" subtitle="Loading your storefront…" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        icon={<Store className="h-[18px] w-[18px]" />}
        title={creating ? 'Register your storefront' : 'Business storefront'}
        subtitle={
          creating
            ? 'Add your business so officers know where reports come from and you get alerts nearby.'
            : 'Officers see these details on your reports. Your address decides which nearby alerts you get.'
        }
      />

      <form onSubmit={save} noValidate className="space-y-4">
        <Field label="Business name" error={errors.businessName}>
          {(id) => (
            <Input
              id={id}
              value={form.businessName}
              onChange={(e) => update('businessName', e.target.value)}
              placeholder="e.g. Riverbluff Coffee Co."
              autoComplete="organization"
              aria-invalid={errors.businessName ? true : undefined}
            />
          )}
        </Field>

        <Field
          label="Street address"
          error={errors.address}
          hint="Your downtown street address — we use it to place you on the map."
        >
          {(id) => (
            <Input
              id={id}
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="e.g. 115 S Main St"
              autoComplete="street-address"
              aria-invalid={errors.address ? true : undefined}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business type">
            {(id) => (
              <Select
                id={id}
                value={form.businessType}
                onChange={(e) => {
                  if (isBusinessType(e.target.value)) update('businessType', e.target.value);
                }}
              >
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Contact name" optional>
            {(id) => (
              <Input
                id={id}
                value={form.contactName}
                onChange={(e) => update('contactName', e.target.value)}
                placeholder="Who officers should ask for"
                autoComplete="name"
              />
            )}
          </Field>
          <Field label="Phone" optional error={errors.phone}>
            {(id) => (
              <Input
                id={id}
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="(901) 555-0100"
                autoComplete="tel"
                aria-invalid={errors.phone ? true : undefined}
              />
            )}
          </Field>
          <Field label="Email" optional error={errors.email}>
            {(id) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                placeholder="you@business.com"
                autoComplete="email"
                aria-invalid={errors.email ? true : undefined}
              />
            )}
          </Field>
        </div>

        {profile && (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-subtle">
            <MapPinned className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            <span>
              Member since {format(profile.registeredAt, 'MMM d, yyyy')}
              {hasPin(profile) && (
                <>
                  {' · pinned at '}
                  <span className="font-mono tabular">
                    {profile.lat.toFixed(4)}, {profile.lng.toFixed(4)}
                  </span>
                </>
              )}
            </span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {draft && (
            <Button variant="ghost" onClick={discard} disabled={busy}>
              Discard changes
            </Button>
          )}
          <Button type="submit" loading={busy} disabled={!creating && !draft}>
            {phase === 'locating'
              ? 'Finding address…'
              : phase === 'saving'
                ? 'Saving…'
                : creating
                  ? 'Register storefront'
                  : 'Save storefront'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
