import { useMemo, useState } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { useMpdIncidents } from '../../hooks/useMpdIncidents';
import { useNow } from '../../hooks/useNow';
import type { PublicIncident } from '../../hooks/usePublicIncidents';
import { DOWNTOWN_CENTER, DOWNTOWN_CORE, jitter } from '../../lib/geo';
import { categoryMeta, PRIORITIES, STATUSES } from '../../lib/taxonomy';
import { cn, timeAgo } from '../../lib/format';
import { AutoResize, FlyTo, type MapFocus } from './IncidentMap';
import { incidentIcon, tileLayerProps } from './mapIcons';
import MpdLayer, { MpdKey } from './MpdLayer';

/** The public map: approximate pins only — no titles, addresses or people. */
export default function PublicIncidentMap({
  incidents,
  selected,
  onSelect,
  focus,
}: {
  incidents: PublicIncident[];
  selected: string | null;
  onSelect: (ref: string) => void;
  focus: MapFocus | null;
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const now = useNow();
  // The MPD's own reports from the City's open data: a layer of their own, once it is turned on (lib/mpd.ts).
  const mpd = useMpdIncidents();
  const [mpdOn, setMpdOn] = useState(true);
  const showMpd = mpd.enabled && mpdOn;

  // Closed reports underneath, then the most urgent on top.
  const ordered = useMemo(
    () =>
      [...incidents].sort((a, b) => {
        const ao = STATUSES[a.status].open ? 1 : 0;
        const bo = STATUSES[b.status].open ? 1 : 0;
        return ao - bo || b.priority - a.priority;
      }),
    [incidents],
  );

  return (
    <div className="relative isolate h-full w-full overflow-hidden">
      <MapContainer center={DOWNTOWN_CENTER} zoom={15} className="h-full w-full" zoomControl>
        <TileLayer key={dark ? 'dark' : 'light'} {...tileLayerProps(dark)} />
        <FlyTo focus={focus} />
        <AutoResize />
        <Polygon
          positions={DOWNTOWN_CORE}
          pathOptions={{ color: '#c5a55a', weight: 1.5, dashArray: '6 6', fillColor: '#c5a55a', fillOpacity: dark ? 0.04 : 0.05 }}
          interactive={false}
        />
        {showMpd && <MpdLayer feed={mpd} />}
        {ordered.map((i) => {
          const isSelected = i.ref === selected;
          const meta = categoryMeta(i.category);
          return (
            <Marker
              key={i.ref}
              // Locations arrive rounded to ~100 m; spread pins that share a spot.
              position={jitter(i.lat, i.lng, i.ref, 18)}
              icon={incidentIcon(i.category, i, isSelected)}
              zIndexOffset={isSelected ? 1000 : STATUSES[i.status].open ? 500 - i.priority * 10 : 0}
              eventHandlers={{ click: () => onSelect(i.ref) }}
              keyboard
              title={`${meta.short}, ${STATUSES[i.status].label.toLowerCase()}`}
            >
              <Tooltip direction="top" opacity={1}>
                <div className="max-w-[220px]">
                  <p className="text-[12px] font-semibold">
                    {PRIORITIES[i.priority].short} · {meta.short}
                  </p>
                  <p className="text-[12px] leading-snug">
                    {STATUSES[i.status].label} · reported {timeAgo(i.reportedAt, now)}
                  </p>
                  <p className="text-[11px] opacity-70">Approximate location (about a block)</p>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {mpd.enabled && (
        <button
          type="button"
          onClick={() => setMpdOn((on) => !on)}
          aria-pressed={mpdOn}
          className={cn(
            'absolute right-3 top-3 z-[500] inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold shadow-pop transition-colors',
            mpdOn ? 'text-ink' : 'text-muted',
          )}
          title="The Memphis Police Department’s own reports, from the City of Memphis open data"
        >
          <span className={cn('dt-mpd-key', !mpdOn && 'opacity-40')} aria-hidden />
          MPD reports · {mpd.windowDays ?? 7} days
        </button>
      )}

      <div className="pointer-events-none absolute bottom-6 left-3 z-[500] hidden gap-1.5 rounded-xl border border-line bg-surface/90 px-2.5 py-1.5 shadow-pop backdrop-blur sm:flex">
        {([1, 2, 3, 4] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITIES[p].hex }} />
            {PRIORITIES[p].label}
          </span>
        ))}
        {showMpd && <MpdKey days={mpd.windowDays} />}
      </div>
    </div>
  );
}
