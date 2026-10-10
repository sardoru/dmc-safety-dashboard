import { LayerGroup, Marker, Tooltip } from 'react-leaflet';
import { useNow } from '../../hooks/useNow';
import { jitter } from '../../lib/geo';
import { timeAgo } from '../../lib/format';
import { MPD_NOTE, mpdCitation, ucrLabel, type MpdFeed } from '../../lib/mpd';
import { mpdIcon } from './mapIcons';

const memphisTime = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * The MPD's reports from the City's open data, as their own layer: slate diamonds under the community's pins. The
 * City's citation goes into the map's attribution line for as long as the layer is on.
 */
export default function MpdLayer({ feed }: { feed: MpdFeed }) {
  const now = useNow();
  const incidents = feed.incidents ?? [];
  const url = feed.source?.url ?? 'https://data.memphistn.gov';
  const attribution = `MPD reports: <a href="${url}" target="_blank" rel="noopener noreferrer">${mpdCitation(feed)}</a>`;

  return (
    <LayerGroup attribution={attribution}>
      {incidents.map((m) => {
        // The offense line, unless it only repeats the category ("Arson" · "Arson").
        const offenses = m.offenses.map(ucrLabel).filter((o) => o.toLowerCase() !== m.category.trim().toLowerCase());
        return (
          <Marker
            key={`mpd-${m.id}`}
            // The City rounds places to ~100 m; spread reports that share a spot.
            position={jitter(m.lat, m.lng, m.id, 14)}
            icon={mpdIcon()}
            zIndexOffset={-300}
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
                  {m.occurredAt && m.occurredAt < m.reportedAt - 3_600_000 ? ` (happened ${memphisTime(m.occurredAt)})` : ''}
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
