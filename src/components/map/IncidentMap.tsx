import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { Building2, Flame, Layers, ScanEye, Shapes } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import type { Bolo, Business, Incident } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { DOWNTOWN_CENTER, DOWNTOWN_CORE, jitter } from '../../lib/geo';
import { PRIORITIES, categoryMeta } from '../../lib/taxonomy';
import { cn, shortAddress } from '../../lib/format';
import { boloIcon, businessIcon, incidentIcon, TILE_ATTRIBUTION, tileUrl } from './mapIcons';

export interface MapFocus {
  lat: number;
  lng: number;
  zoom?: number;
  /** Change the key to fly again to the same spot. */
  key: string;
}

interface IncidentMapProps {
  incidents: Incident[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  businesses?: Business[];
  myBusiness?: { lat: number; lng: number; name: string } | null;
  bolos?: Bolo[];
  focus?: MapFocus | null;
  /** Show the layer toggles. */
  controls?: boolean;
  defaultLayers?: Partial<Layers>;
  zoom?: number;
  /** Initial center (defaults to the downtown core). */
  center?: [number, number];
  className?: string;
}

interface Layers {
  district: boolean;
  heat: boolean;
  businesses: boolean;
  bolos: boolean;
}

function FlyTo({ focus }: { focus?: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? 17, { duration: 0.7 });
  }, [focus, map]);
  return null;
}

/** Leaflet measures its box once; re-measure when the panel around it resizes. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export default function IncidentMap({
  incidents,
  selectedId,
  onSelect,
  businesses = [],
  myBusiness,
  bolos = [],
  focus,
  controls = true,
  defaultLayers,
  zoom = 15,
  center,
  className,
}: IncidentMapProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [layers, setLayers] = useState<Layers>({ district: true, heat: false, businesses: false, bolos: true, ...defaultLayers });
  const [menu, setMenu] = useState(false);

  // Draw closed incidents first so open ones sit on top.
  const ordered = useMemo(
    () =>
      [...incidents].sort((a, b) => {
        const ao = a.status === 'resolved' || a.status === 'dismissed' ? 0 : 1;
        const bo = b.status === 'resolved' || b.status === 'dismissed' ? 0 : 1;
        return ao - bo || b.priority - a.priority;
      }),
    [incidents],
  );

  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)}>
      <MapContainer center={center ?? DOWNTOWN_CENTER} zoom={zoom} className="h-full w-full" zoomControl preferCanvas={false}>
        <TileLayer key={dark ? 'dark' : 'light'} url={tileUrl(dark)} attribution={TILE_ATTRIBUTION} detectRetina />
        <FlyTo focus={focus} />
        <AutoResize />

        {layers.district && (
          <Polygon
            positions={DOWNTOWN_CORE}
            pathOptions={{ color: '#c5a55a', weight: 1.5, dashArray: '6 6', fillColor: '#c5a55a', fillOpacity: dark ? 0.04 : 0.05 }}
            interactive={false}
          />
        )}

        {layers.heat &&
          incidents.map((i) => (
            <CircleMarker
              key={`heat-${i.id}`}
              center={[i.lat, i.lng]}
              radius={26}
              interactive={false}
              pathOptions={{ stroke: false, fillColor: PRIORITIES[i.priority].hex, fillOpacity: 0.14 }}
            />
          ))}

        {layers.businesses &&
          businesses.map((b) => (
            <Marker key={`biz-${b.id}`} position={[b.lat, b.lng]} icon={businessIcon(false)} zIndexOffset={-200}>
              <Tooltip direction="top">{b.name}</Tooltip>
            </Marker>
          ))}

        {myBusiness && (
          <Marker position={[myBusiness.lat, myBusiness.lng]} icon={businessIcon(true)} zIndexOffset={-100}>
            <Tooltip direction="top" permanent={false}>
              {myBusiness.name} · you
            </Tooltip>
          </Marker>
        )}

        {layers.bolos &&
          bolos
            .filter((b) => b.lastSeenLat !== undefined && b.lastSeenLng !== undefined)
            .map((b) => (
              <Marker key={`bolo-${b.id}`} position={[b.lastSeenLat!, b.lastSeenLng!]} icon={boloIcon()} zIndexOffset={100}>
                <Tooltip direction="top">
                  <span className="font-semibold">BOLO:</span> {b.title}
                </Tooltip>
              </Marker>
            ))}

        {ordered.map((i) => {
          const selected = i.id === selectedId;
          const pos = jitter(i.lat, i.lng, i.id);
          return (
            <Marker
              key={i.id}
              position={pos}
              icon={incidentIcon(i.category, i, selected)}
              zIndexOffset={selected ? 1000 : i.status === 'active' ? 500 - i.priority * 10 : 0}
              eventHandlers={onSelect ? { click: () => onSelect(i.id) } : undefined}
              keyboard
              title={`${PRIORITIES[i.priority].short} ${categoryMeta(i.category).short}: ${i.title}`}
            >
              <Tooltip direction="top" opacity={1}>
                <div className="max-w-[220px]">
                  <p className="text-[12px] font-semibold">
                    {PRIORITIES[i.priority].short} · {categoryMeta(i.category).short}
                  </p>
                  <p className="text-[12px] leading-snug">{i.title}</p>
                  <p className="text-[11px] opacity-70">{shortAddress(i.address)}</p>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {controls && (
        <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 shadow-pop transition-colors hover:text-ink',
              menu && 'bg-accent-soft text-accent-strong',
            )}
            aria-label="Map layers"
            aria-expanded={menu}
          >
            <Layers className="h-5 w-5" />
          </button>
          {menu && (
            <div className="w-52 animate-slide-up rounded-2xl border border-line bg-surface p-2 shadow-pop">
              {(
                [
                  ['district', 'Downtown core outline', Shapes],
                  ['heat', 'Incident density', Flame],
                  ['bolos', 'BOLO last seen', ScanEye],
                  ['businesses', 'Member businesses', Building2],
                ] as const
              ).map(([key, label, Icon]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] text-ink hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={layers[key]}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded accent-[var(--primary)]"
                  />
                  <Icon className="h-4 w-4 text-muted" aria-hidden />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-6 left-3 z-[500] hidden gap-1.5 rounded-xl border border-line bg-surface/90 px-2.5 py-1.5 shadow-pop backdrop-blur sm:flex">
        {([1, 2, 3, 4] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITIES[p].hex }} />
            {PRIORITIES[p].short}
          </span>
        ))}
      </div>
    </div>
  );
}
