import { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { LoaderCircle, LocateFixed, Search, Store } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { Marker as LeafletMarker } from 'leaflet';
import { useTheme } from '../../context/ThemeContext';
import { currentPosition, DOWNTOWN_CENTER, geocode, reverseGeocode, type Place } from '../../lib/geo';
import { cn, shortAddress } from '../../lib/format';
import { pickIcon, tileLayerProps } from './mapIcons';

interface LocationPickerProps {
  value: Place | null;
  onChange: (p: Place) => void;
  /** Offer a one-tap "at my business" option. */
  business?: { lat: number; lng: number; address: string; name: string } | null;
  className?: string;
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function Recenter({ target }: { target: { lat: number; lng: number; n: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 17, { duration: 0.6 });
  }, [target, map]);
  return null;
}

export default function LocationPicker({ value, onChange, business, className }: LocationPickerProps) {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'search' | 'locate' | null>(null);
  const [error, setError] = useState('');
  const [recenter, setRecenter] = useState<{ lat: number; lng: number; n: number } | null>(null);

  const placeSeq = useRef(0);
  const place = async (lat: number, lng: number, address?: string) => {
    setError('');
    const seq = ++placeSeq.current;
    onChange({ lat, lng, address });
    if (!address) {
      const found = await reverseGeocode(lat, lng);
      // A newer pin (another tap, a search, "At my business") wins over a
      // late answer for this one.
      if (found && seq === placeSeq.current) onChange({ lat, lng, address: found });
    }
  };

  const fly = (lat: number, lng: number) => setRecenter((r) => ({ lat, lng, n: (r?.n ?? 0) + 1 }));

  const search = async () => {
    if (!query.trim()) return;
    setBusy('search');
    setError('');
    const found = await geocode(query);
    setBusy(null);
    if (!found) {
      setError('Couldn’t find that place — try a cross street, e.g. “Main St and Union Ave”.');
      return;
    }
    fly(found.lat, found.lng);
    void place(found.lat, found.lng, found.address);
  };

  const locate = async () => {
    setBusy('locate');
    setError('');
    try {
      const p = await currentPosition();
      fly(p.lat, p.lng);
      void place(p.lat, p.lng);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not get your location');
    } finally {
      setBusy(null);
    }
  };

  const atBusiness = () => {
    if (!business) return;
    fly(business.lat, business.lng);
    void place(business.lat, business.lng, business.address);
  };

  const isAtBusiness = Boolean(
    business && value && Math.abs(value.lat - business.lat) < 1e-6 && Math.abs(value.lng - business.lng) < 1e-6,
  );

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap gap-2">
        {business && (
          <button
            type="button"
            onClick={atBusiness}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-semibold transition-colors',
              isAtBusiness ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line bg-surface text-ink-2 hover:border-line-strong',
            )}
          >
            <Store className="h-4 w-4" /> At {business.name}
          </button>
        )}
        <button
          type="button"
          onClick={() => void locate()}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:border-line-strong"
        >
          {busy === 'locate' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          My location
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="relative mb-2"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a street, cross street or landmark"
          className="input pl-9 pr-20"
          aria-label="Search for a location"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1/2 h-7 -translate-y-1/2 rounded-lg bg-surface-3 px-2.5 text-[12px] font-semibold text-ink-2 hover:bg-line"
        >
          {busy === 'search' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : 'Find'}
        </button>
      </form>
      <div className="relative h-64 overflow-hidden rounded-2xl border border-line sm:h-72">
        <MapContainer center={value ? [value.lat, value.lng] : DOWNTOWN_CENTER} zoom={value ? 17 : 15} className="h-full w-full">
          <TileLayer key={theme} {...tileLayerProps(theme === 'dark')} />
          <ClickToPlace onPick={(lat, lng) => void place(lat, lng)} />
          <Recenter target={recenter} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pickIcon()}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = (e.target as LeafletMarker).getLatLng();
                  void place(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
        {!value && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-navy-900/80 px-3 py-1.5 text-[12px] font-medium text-white">
            Tap the map to drop a pin
          </div>
        )}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
      {value?.address && !error && (
        <p className="mt-2 text-[13px] text-muted">
          <span className="font-medium text-ink">{shortAddress(value.address)}</span>
          {isAtBusiness && ' · your business'}
        </p>
      )}
    </div>
  );
}
