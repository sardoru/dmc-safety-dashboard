import { useEffect, useMemo, useRef, useState } from 'react';
import { Radio, Search, X, Pause, Play, Mic, AlertTriangle, Inbox } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useRadio, classifyUrgency } from '../context/RadioContext';
import { useAlerts } from '../context/AlertContext';
import { formatTime } from '../utils/helpers';
import type { Alert, RadioEntry } from '../types';
import PoliceScanner from './PoliceScanner';

/** A unified activity-feed row: either a live scanner transcription or a real report. */
type FeedEntry = RadioEntry & { source: 'scanner' | 'report' };

/** Map a real submitted report (Alert) into a feed row. */
function alertToEntry(a: Alert): FeedEntry {
  return {
    id: `report-${a.id}`,
    timestamp: a.timestamp,
    speaker: a.businessName || 'Downtown report',
    channel: a.incidentType,
    text: a.description?.trim() || a.address || a.incidentType,
    urgency: a.status === 'resolved' ? 'routine' : classifyUrgency(`${a.incidentType} ${a.description}`),
    source: 'report',
  };
}

function ConnectionBadge({ wsStatus, dark }: { wsStatus: string; dark: boolean }) {
  switch (wsStatus) {
    case 'connected':
      return (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-500 fluid-text-xs font-medium">LIVE</span>
        </div>
      );
    case 'connecting':
      return (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className={`fluid-text-xs font-medium ${dark ? 'text-blue-400' : 'text-blue-500'}`}>Connecting...</span>
        </div>
      );
    default:
      return null;
  }
}

function EnergyIndicator({ energy, dark }: { energy?: number; dark: boolean }) {
  if (energy == null) return null;
  let label: string;
  let color: string;
  if (energy > 0.08) {
    label = 'loud';
    color = dark ? 'text-red-400' : 'text-red-500';
  } else if (energy > 0.03) {
    label = 'normal';
    color = dark ? 'text-green-400' : 'text-green-600';
  } else {
    label = 'quiet';
    color = dark ? 'text-neutral-500' : 'text-neutral-400';
  }
  return <span className={`fluid-text-xs ${color}`}>{label}</span>;
}

function EmptyState({ dark }: { dark: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
      <Inbox className={`w-8 h-8 mb-3 ${dark ? 'text-neutral-700' : 'text-neutral-300'}`} />
      <p className={`fluid-text-sm font-medium ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
        No activity yet
      </p>
      <p className={`fluid-text-xs mt-1 max-w-[220px] ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
        Reports submitted from the platform — and live scanner transcriptions when the bridge is
        connected — appear here in real time.
      </p>
    </div>
  );
}

export default function RadioFeed() {
  const { theme } = useTheme();
  const { entries, isLive, toggleLive, isSpeaking, wsStatus } = useRadio();
  const { alerts } = useAlerts();
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  // Merge real platform reports + real radio transcriptions into one time-sorted
  // stream (oldest → newest, newest at the bottom). No simulated data.
  const merged = useMemo<FeedEntry[]>(() => {
    const scanner: FeedEntry[] = entries.map((e) => ({ ...e, source: 'scanner' }));
    const reports: FeedEntry[] = alerts.map(alertToEntry);
    return [...scanner, ...reports].sort((a, b) => a.timestamp - b.timestamp);
  }, [entries, alerts]);

  const filtered = search
    ? merged.filter(
        (e) =>
          e.text.toLowerCase().includes(search.toLowerCase()) ||
          e.speaker.toLowerCase().includes(search.toLowerCase()) ||
          e.channel.toLowerCase().includes(search.toLowerCase()),
      )
    : merged;

  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, isLive]);

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'emergency':
        return 'text-red-500';
      case 'caution':
        return 'text-amber-500';
      default:
        return dark ? 'text-green-400' : 'text-green-600';
    }
  };

  const urgencyBg = (urgency: string) => {
    switch (urgency) {
      case 'emergency':
        return dark ? 'bg-red-500/10 border-l-2 border-red-500' : 'bg-red-50 border-l-2 border-red-500';
      case 'caution':
        return dark ? 'bg-amber-500/5 border-l-2 border-amber-500' : 'bg-amber-50 border-l-2 border-amber-500';
      default:
        return '';
    }
  };

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden ${dark ? 'card-dark' : 'card-light'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
          <h2 className="font-semibold fluid-text-sm">Activity Feed</h2>
          <ConnectionBadge wsStatus={wsStatus} dark={dark} />
          {isSpeaking && (
            <div className="flex items-center gap-1 ml-1">
              <Mic className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            </div>
          )}
        </div>
        <button
          onClick={toggleLive}
          className={`tap-target p-2 rounded-lg transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
          aria-label={isLive ? 'Pause feed' : 'Resume feed'}
        >
          {isLive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
      </div>

      {/* Live Memphis PD scanner */}
      <PoliceScanner />

      {/* Search */}
      <div className={`px-3 py-2 border-b ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${dark ? 'bg-white/5' : 'bg-neutral-50'}`}>
          <Search className={`w-3.5 h-3.5 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity..."
            className={`flex-1 bg-transparent outline-none fluid-text-xs ${dark ? 'text-neutral-200 placeholder:text-neutral-600' : 'text-neutral-700 placeholder:text-neutral-400'}`}
          />
          {search && (
            <button onClick={() => setSearch('')} className="p-0.5">
              <X className={`w-3.5 h-3.5 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
            </button>
          )}
        </div>
      </div>

      {/* Entries */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1">
        {filtered.length === 0 ? (
          <EmptyState dark={dark} />
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className={`px-2.5 py-2 rounded-lg ${urgencyBg(entry.urgency)} animate-fade-in`}>
              <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                {entry.source === 'report' ? (
                  <AlertTriangle className={`w-3 h-3 self-center flex-shrink-0 ${urgencyColor(entry.urgency)}`} />
                ) : (
                  <Radio className={`w-3 h-3 self-center flex-shrink-0 ${dark ? 'text-neutral-600' : 'text-neutral-400'}`} />
                )}
                <span className={`font-mono fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                  [{formatTime(entry.timestamp)}]
                </span>
                <span className={`font-semibold fluid-text-xs ${urgencyColor(entry.urgency)}`}>{entry.speaker}</span>
                <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-300'}`}>{entry.channel}</span>
                {entry.duration_seconds != null && (
                  <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
                    {entry.duration_seconds.toFixed(1)}s
                  </span>
                )}
                <EnergyIndicator energy={entry.energy} dark={dark} />
              </div>
              <p className={`fluid-text-xs leading-relaxed ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                {entry.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
