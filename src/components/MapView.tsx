import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Layers } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { useProfile } from '../context/ProfileContext';
import { useBusinesses } from '../hooks/useBusinesses';
import { formatRelative } from '../utils/helpers';
import type { Business, BusinessType } from '../types';
import 'leaflet/dist/leaflet.css';

const MEMPHIS_CENTER: [number, number] = [35.1495, -90.0490];
const DEFAULT_ZOOM = 15;

const businessTypeEmoji: Record<BusinessType, string> = {
  restaurant: '🍽️',
  retail: '🛍️',
  office: '🏢',
  bar: '🎵',
  hotel: '🏨',
  service: '🔧',
  other: '📍',
};

function createBusinessIcon(type: BusinessType) {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      width: 32px; height: 32px;
      background: white;
      border: 2px solid #1B2A4A;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    ">${businessTypeEmoji[type]}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

function createAlertIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="alert-marker">
      <div class="alert-marker-ring"></div>
      <div class="alert-marker-dot">
        <span style="font-size:10px;color:white;">⚠</span>
      </div>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

function createUserIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      width: 36px; height: 36px;
      background: #C5A55A;
      border: 3px solid white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(197,165,90,0.4);
    ">⭐</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

interface MapViewProps {
  flyToRef?: React.MutableRefObject<((lat: number, lng: number) => void) | null>;
}

export default function MapView({ flyToRef }: MapViewProps) {
  const { theme } = useTheme();
  const { activeAlerts } = useAlerts();
  const { profile } = useProfile();
  const businesses = useBusinesses();
  const otherBusinesses = profile ? businesses.filter((b) => b.id !== profile.id) : businesses;
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const dark = theme === 'dark';

  const alertIcon = useMemo(() => createAlertIcon(), []);
  const userIcon = useMemo(() => createUserIcon(), []);
  const businessIcons = useMemo(() => {
    const icons: Partial<Record<BusinessType, L.DivIcon>> = {};
    const types: BusinessType[] = ['restaurant', 'retail', 'office', 'bar', 'hotel', 'service', 'other'];
    for (const t of types) {
      icons[t] = createBusinessIcon(t);
    }
    return icons;
  }, []);

  const handleFocusAlert = useCallback((lat: number, lng: number) => {
    setFlyTarget({ center: [lat, lng], zoom: 18 });
  }, []);

  useEffect(() => {
    if (flyToRef) {
      flyToRef.current = handleFocusAlert;
    }
  }, [flyToRef, handleFocusAlert]);

  // CARTO Voyager (light) / Dark Matter (dark) — clean OSM-based basemaps that
  // read well behind the markers. Retina (`{r}` → @2x via detectRetina) keeps
  // them crisp on high-DPI screens.
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const tileAttrib =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  const allAlerts = useAlerts().alerts;
  const recentAlerts = allAlerts.filter(a => a.timestamp > Date.now() - 48 * 3600_000);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden">
      <MapContainer
        center={MEMPHIS_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full"
        zoomControl={true}
      >
        <TileLayer key={dark ? 'dark' : 'light'} url={tileUrl} attribution={tileAttrib} detectRetina />

        {flyTarget && <FlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}

        {/* Business markers */}
        {otherBusinesses.map(biz => (
          <Marker key={biz.id} position={[biz.lat, biz.lng]} icon={businessIcons[biz.type]}>
            <Popup>
              <BusinessPopup business={biz} />
            </Popup>
          </Marker>
        ))}

        {/* User business marker */}
        {profile && (
          <Marker position={[profile.lat, profile.lng]} icon={userIcon}>
            <Popup>
              <div className="min-w-[180px]">
                <div className="font-bold text-sm">{profile.businessName}</div>
                <div className="text-xs text-gray-500">{profile.address}</div>
                <div className="text-xs text-gold-600 font-medium mt-1">Your Business</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Active alert markers */}
        {activeAlerts.map(alert => (
          <Marker key={alert.id} position={[alert.lat, alert.lng]} icon={alertIcon}>
            <Popup>
              <div className="min-w-[200px]">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-red-500 font-bold text-sm">⚠ {alert.incidentType}</span>
                </div>
                <div className="font-semibold text-sm">{alert.businessName}</div>
                <div className="text-xs text-gray-500 mb-1">{alert.address}</div>
                <p className="text-xs leading-relaxed">{alert.description}</p>
                <div className="text-xs text-gray-400 mt-1">{formatRelative(alert.timestamp)}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Heatmap overlay (simple circles) */}
        {showHeatmap &&
          recentAlerts.map(alert => (
            <CircleMarker
              key={`heat-${alert.id}`}
              center={[alert.lat, alert.lng]}
              radius={30}
              pathOptions={{
                color: 'transparent',
                fillColor: alert.status === 'active' ? '#ef4444' : '#f59e0b',
                fillOpacity: 0.15,
              }}
            />
          ))
        }
      </MapContainer>

      {/* Heatmap toggle */}
      <button
        onClick={() => setShowHeatmap(!showHeatmap)}
        className={`
          absolute top-3 right-3 z-[1000] tap-target p-2.5 rounded-xl shadow-lg transition-all
          ${showHeatmap
            ? 'bg-navy-600 text-white'
            : dark
              ? 'bg-neutral-900/90 text-neutral-300 hover:bg-neutral-800 border border-white/10'
              : 'bg-white text-neutral-600 hover:bg-neutral-50 border border-neutral-200'
          }
        `}
        title="Toggle incident heatmap"
      >
        <Layers className="w-5 h-5" />
      </button>
    </div>
  );
}

function BusinessPopup({ business }: { business: Business }) {
  return (
    <div className="min-w-[180px]">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{businessTypeEmoji[business.type]}</span>
        <span className="font-bold text-sm">{business.name}</span>
      </div>
      <div className="text-xs text-gray-500 mb-1">{business.address}</div>
      <div className="text-xs">
        <span className="font-medium">{business.contactName}</span>
        {business.phone && <span className="text-gray-400"> · {business.phone}</span>}
      </div>
    </div>
  );
}
