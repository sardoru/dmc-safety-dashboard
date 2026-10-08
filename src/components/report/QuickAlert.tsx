import { useState } from 'react';
import { MapPin, Zap } from 'lucide-react';
import type { CategoryKey, Incident, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import { useVoice } from '../../context/VoiceContext';
import { categoryMeta, suggestPriority } from '../../lib/taxonomy';
import { shortAddress } from '../../lib/format';
import type { Place } from '../../lib/geo';
import LocationPicker from '../map/LocationPicker';
import { Button } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Input } from '../ui/Form';
import CategoryGrid from './CategoryGrid';
import EmergencyCallout from './EmergencyCallout';
import { businessPlace } from './draft';

interface QuickAlertProps {
  profile: UserProfile | null;
  onSubmitted: (incident: Incident) => void;
}

/** One-tap alert for something happening right now. */
export default function QuickAlert({ profile, onSubmitted }: QuickAlertProps) {
  const { role, displayName } = useAuth();
  const { createIncident } = useIncidents();
  const { unlock } = useVoice();
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [note, setNote] = useState('');
  const [place, setPlace] = useState<Place | null>(() => businessPlace(profile));
  const [changing, setChanging] = useState(!profile);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const officer = role === 'officer' || role === 'admin';

  const send = async () => {
    if (!category || !place) return;
    unlock();
    setSending(true);
    setError('');
    const meta = categoryMeta(category);
    try {
      const inc = await createIncident({
        source: officer ? 'officer' : 'business',
        kind: 'quick',
        category,
        priority: suggestPriority(category, { happeningNow: true }),
        title: note.trim() ? note.trim().slice(0, 90) : `${meta.short} — happening now`,
        description: note.trim() || `${meta.label} reported as happening now.`,
        address: place.address ?? '',
        lat: place.lat,
        lng: place.lng,
        happeningNow: true,
        reporterName: officer ? displayName : (profile?.businessName ?? displayName),
        businessId: officer ? undefined : profile?.id,
        contactPhone: officer ? undefined : profile?.phone,
        visibility: 'community',
        contactOk: true,
      });
      onSubmitted(inc);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the alert.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <Zap className="h-5 w-5 text-amber-500" /> What’s happening?
        </h2>
        <p className="mb-5 mt-1 text-[13px] text-muted">Tap one — we’ll send it right away with your location. Add details afterwards from your dashboard.</p>
        <CategoryGrid value={category} onChange={setCategory} compact />
      </div>
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <EmergencyCallout loud={Boolean(category && categoryMeta(category).group === 'emergency')} />
        <div className="card space-y-4 p-5">
          <div>
            <p className="label">Where</p>
            {place && !changing ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
                  <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
                  <span className="truncate">{profile && place.lat === profile.lat ? `${profile.businessName} · ` : ''}{shortAddress(place.address ?? '') || 'Pinned location'}</span>
                </span>
                <button type="button" onClick={() => setChanging(true)} className="text-[12px] font-semibold text-accent-strong hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <LocationPicker
                value={place}
                onChange={setPlace}
                business={profile ? { lat: profile.lat, lng: profile.lng, address: profile.address, name: profile.businessName } : null}
              />
            )}
          </div>
          <div>
            <label className="label" htmlFor="quick-note">
              One line about it <span className="font-normal text-subtle">(optional)</span>
            </label>
            <Input id="quick-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Man in red jacket shouting at customers" maxLength={140} />
          </div>
          {error && <Banner tone="danger">{error}</Banner>}
          <Button block size="xl" variant="danger" icon={<Zap className="h-5 w-5" />} loading={sending} disabled={!category || !place} onClick={() => void send()}>
            Send alert now
          </Button>
        </div>
      </div>
    </div>
  );
}
