import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { LocateFixed, Loader2 } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import 'leaflet/dist/leaflet.css';

const MEMPHIS_CENTER: [number, number] = [35.1495, -90.049];

export interface PinValue {
  lat: number;
  lng: number;
  address?: string;
}

function pinIcon() {
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div style="
      width:34px;height:34px;background:#C5A55A;border:3px solid white;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);box-shadow:0 3px 8px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:15px;">📍</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 32],
  });
}

async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`,
    );
    const data = await res.json();
    return data?.display_name as string | undefined;
  } catch {
    return undefined;
  }
}

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 17, { duration: 0.7 });
  }, [target, map]);
  return null;
}

export default function ReportPinMap({
  value,
  onPlace,
}: {
  value: PinValue | null;
  onPlace: (v: PinValue) => void;
}) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [recenter, setRecenter] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const icon = useMemo(() => pinIcon(), []);

  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const place = async (lat: number, lng: number) => {
    onPlace({ lat, lng });
    const address = await reverseGeocode(lat, lng);
    if (address) onPlace({ lat, lng, address });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setRecenter([latitude, longitude]);
        void place(latitude, longitude);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="relative w-full h-64 sm:h-72 rounded-xl overflow-hidden">
      <MapContainer center={value ? [value.lat, value.lng] : MEMPHIS_CENTER} zoom={15} className="w-full h-full">
        <TileLayer url={tileUrl} />
        <ClickToPlace onPick={(lat, lng) => void place(lat, lng)} />
        <Recenter target={recenter} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = e.target.getLatLng();
                void place(lat, lng);
              },
            }}
          />
        )}
      </MapContainer>

      <button
        onClick={useMyLocation}
        className={`absolute top-3 right-3 z-[1000] tap-target flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-lg fluid-text-xs font-semibold transition-colors ${
          dark ? 'bg-neutral-900/90 text-gold-400 border border-white/10 hover:bg-neutral-800' : 'bg-white text-navy-600 border border-neutral-200 hover:bg-neutral-50'
        }`}
      >
        {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
        My location
      </button>

      {!value && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-black/60 text-white fluid-text-xs pointer-events-none">
          Tap the map to drop a pin
        </div>
      )}
    </div>
  );
}
