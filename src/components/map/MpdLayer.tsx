import { useEffect, useRef } from 'react';
import type { Marker as LeafletMarker } from 'leaflet';
import { LayerGroup, Marker, Tooltip } from 'react-leaflet';
import { useNow } from '../../hooks/useNow';
import { timeAgo } from '../../lib/format';
import { MPD_NOTE, memphisTime, mpdCitation, mpdHappened, mpdOffenses, mpdPosition, ucrLabel, type MpdFeed } from '../../lib/mpd';
import { mpdIcon } from './mapIcons';

/**
 * The MPD's reports from the City's open data, as their own layer: slate diamonds under the community's pins. The
 * City's citation goes into the map's attribution line for as long as the layer is on. With `onSelect` a diamond can
 * be picked (the public map lists them); the picked one sits on top, ringed, with its card open.
 */
export default function MpdLayer({
  feed,
  selected = null,
  onSelect,
}: {
  feed: MpdFeed;
  selected?: string | null;
  onSelect?: (id: string) => void;
}) {
  const now = useNow();
  const markers = useRef(new Map<string, LeafletMarker>());
  const incidents = feed.incidents ?? [];
  const url = feed.source?.url ?? 'https://data.memphistn.gov';
  const attribution = `MPD reports: <a href="${url}" target="_blank" rel="noopener noreferrer">${mpdCitation(feed)}</a>`;

  useEffect(() => {
    const marker = selected ? markers.current.get(selected) : undefined;
    marker?.openTooltip();
    return () => void marker?.closeTooltip();
  }, [selected]);

  return (
    <LayerGroup attribution={attribution}>
      {incidents.map((m) => {
        const offenses = mpdOffenses(m);
        const happened = mpdHappened(m);
        const isSelected = m.id === selected;
        return (
          <Marker
            key={`mpd-${m.id}`}
            ref={(marker) => {
              if (marker) markers.current.set(m.id, marker);
              else markers.current.delete(m.id);
            }}
            position={mpdPosition(m)}
            icon={mpdIcon(isSelected)}
            zIndexOffset={isSelected ? 1000 : -300}
            eventHandlers={onSelect ? { click: () => onSelect(m.id) } : undefined}
            keyboard={false}
            title={`MPD report: ${ucrLabel(m.category)}`}
          >
            <Tooltip direction="top" opacity={1}>
              {/* Leaflet tooltips don't wrap by default; these lines can be long. */}
              <div className="w-[248px] whitespace-normal">
                <p className="text-[12px] font-semibold">MPD report · {ucrLabel(m.category)}</p>
                {offenses.length > 0 && <p className="text-[12px] leading-snug">{offenses.join(' · ')}</p>}
                <p className="text-[11px] opacity-80">
                  Reported {timeAgo(m.reportedAt, now)} · {memphisTime(m.reportedAt)}
                  {happened ? ` (happened ${memphisTime(happened)})` : ''}
                </p>
                <p className="text-[11px] opacity-70">{m.address}</p>
                <p className="mt-1 text-[10.5px] leading-snug opacity-70">Source: Memphis Police Department. {MPD_NOTE}</p>
              </div>
            </Tooltip>
          </Marker>
        );
      })}
    </LayerGroup>
  );
}

/** The legend entry: a diamond and "MPD · 7 days". */
export function MpdKey({ days = 7 }: { days?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
      <span className="dt-mpd-key" aria-hidden /> MPD · {days} days
    </span>
  );
}
