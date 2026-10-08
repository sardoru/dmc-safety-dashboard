import { useId, useState, type FormEvent } from 'react';
import { Car, Eye, Phone, Send, UserSearch } from 'lucide-react';
import type { Bolo } from '../../types';
import type { Place } from '../../lib/geo';
import { useBolos } from '../../context/BoloContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { Dialog } from '../ui/Overlay';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Field, Textarea } from '../ui/Form';
import LocationPicker from '../map/LocationPicker';
import { BoloDescription } from './BoloCard';

/** "I've seen this" — files a high-priority, officers-only sighting linked to the notice. */
export default function SightingDialog({ bolo, onClose }: { bolo: Bolo; onClose: () => void }) {
  const { reportSighting } = useBolos();
  const { profile } = useProfile();
  const { push } = useToast();
  const formId = useId();
  const [place, setPlace] = useState<Place | null>(() =>
    profile ? { lat: profile.lat, lng: profile.lng, address: profile.address } : null,
  );
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const KindIcon = bolo.kind === 'vehicle' ? Car : UserSearch;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!place) {
      setError('Drop a pin where you saw them — tap the map, search, or use your location.');
      return;
    }
    setSending(true);
    try {
      await reportSighting(bolo, {
        address: place.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`,
        lat: place.lat,
        lng: place.lng,
        note: note.trim() || undefined,
      });
      push({
        tone: 'success',
        title: 'Sighting sent to officers',
        body: 'Thank you. Please don’t approach or follow — call 911 if anyone is in danger.',
      });
      onClose();
    } catch (err) {
      setSending(false);
      push({
        tone: 'danger',
        title: 'Couldn’t send the sighting',
        body: err instanceof Error ? err.message : 'Please try again. If it’s urgent, call 911.',
      });
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      icon={<Eye className="h-5 w-5" />}
      title="Report a sighting"
      description="Officers are alerted right away with your location and note."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={sending} icon={<Send className="h-4 w-4" aria-hidden />}>
            Send to officers
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5">
        <Banner
          tone="warning"
          title="Stay safe — do not approach"
          action={
            <a
              href="tel:911"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-red-600 px-2.5 text-[12px] font-bold text-white hover:bg-red-700"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden /> 911
            </a>
          }
        >
          Watch from somewhere safe and don’t follow or confront anyone. If someone is in danger, call 911 first.
        </Banner>

        <section aria-label="Who you're looking for" className="rounded-2xl border border-line p-3.5">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
            <KindIcon className="h-4 w-4 text-accent" aria-hidden />
            <span className="min-w-0 truncate">{bolo.title}</span>
          </p>
          <BoloDescription bolo={bolo} />
        </section>

        <div>
          <p className="label">Where did you see {bolo.kind === 'vehicle' ? 'it' : 'them'}?</p>
          <LocationPicker
            value={place}
            onChange={(p) => {
              setPlace(p);
              setError('');
            }}
            business={
              profile ? { lat: profile.lat, lng: profile.lng, address: profile.address, name: profile.businessName } : null
            }
          />
          {error && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <Field
          label="What did you see?"
          optional
          hint="Which way they went, what they’re wearing now, who they’re with, what they were doing."
        >
          {(id) => (
            <Textarea
              id={id}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Walked into the parking garage on Peabody Pl about 2 minutes ago, still carrying the blue tote."
              maxLength={600}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
