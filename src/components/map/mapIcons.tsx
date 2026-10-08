import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import L from 'leaflet';
import { Binoculars, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CATEGORIES, PRIORITIES } from '../../lib/taxonomy';
import type { CategoryKey, Incident } from '../../types';

/**
 * Leaflet markers are HTML strings, so the category glyphs are rendered to SVG
 * markup once, when this module loads (outside any React render).
 */
function renderSvg(Icon: LucideIcon, size = 16): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => root.render(<Icon size={size} strokeWidth={2.4} absoluteStrokeWidth={false} />));
  const html = host.innerHTML;
  root.unmount();
  return html;
}

const GLYPHS: Record<string, string> = {};
for (const c of CATEGORIES) GLYPHS[c.key] = renderSvg(c.icon);
const STORE_SVG = renderSvg(Store, 13);
const BOLO_SVG = renderSvg(Binoculars, 15);

const cache = new Map<string, L.DivIcon>();

export function incidentIcon(category: CategoryKey, i: Pick<Incident, 'priority' | 'status'>, selected: boolean): L.DivIcon {
  const open = i.status === 'active' || i.status === 'acknowledged' || i.status === 'responding';
  const pulse = i.status === 'active' && i.priority <= 2;
  const key = `${category}|${i.priority}|${open ? 1 : 0}|${pulse ? 1 : 0}|${selected ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const color = PRIORITIES[i.priority].hex;
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="dt-pin${open ? '' : ' is-closed'}${selected ? ' is-selected' : ''}">${
      pulse ? `<span class="dt-pin-ring" style="background:${color}55"></span>` : ''
    }<div class="dt-pin-body" style="background:${color}"><span>${GLYPHS[category] ?? ''}</span></div></div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -36],
  });
  cache.set(key, icon);
  return icon;
}

export function businessIcon(mine = false): L.DivIcon {
  const key = `biz|${mine}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = mine ? 30 : 26;
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="dt-biz${mine ? ' is-mine' : ''}">${STORE_SVG}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  });
  cache.set(key, icon);
  return icon;
}

export function boloIcon(): L.DivIcon {
  const hit = cache.get('bolo');
  if (hit) return hit;
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="dt-bolo">${BOLO_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [0, -16],
  });
  cache.set('bolo', icon);
  return icon;
}

export function pickIcon(): L.DivIcon {
  const hit = cache.get('pick');
  if (hit) return hit;
  const icon = L.divIcon({
    className: 'leaflet-div-icon',
    html: '<div class="dt-pick"></div>',
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
  cache.set('pick', icon);
  return icon;
}

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function tileUrl(dark: boolean): string {
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
}
