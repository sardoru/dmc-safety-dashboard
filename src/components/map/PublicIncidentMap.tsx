import { useMemo } from 'react';
import { MapContainer, Marker, Polygon, TileLayer, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import { useNow } from '../../hooks/useNow';
import type { PublicIncident } from '../../hooks/usePublicIncidents';
import { DOWNTOWN_CENTER, DOWNTOWN_CORE, jitter } from '../../lib/geo';
import { categoryMeta, PRIORITIES, STATUSES } from '../../lib/taxonomy';
import { timeAgo } from '../../lib/format';
import { AutoResize, FlyTo, type MapFocus } from './IncidentMap';
import { incidentIcon, tileLayerProps } from './mapIcons';

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

      <div className="pointer-events-none absolute bottom-6 left-3 z-[500] hidden gap-1.5 rounded-xl border border-line bg-surface/90 px-2.5 py-1.5 shadow-pop backdrop-blur sm:flex">
        {([1, 2, 3, 4] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITIES[p].hex }} />
            {PRIORITIES[p].label}
          </span>
        ))}
      </div>
    </div>
  );
}
