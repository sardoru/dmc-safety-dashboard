import { useEffect, useRef, useState } from 'react';
import { Radio, Search, X, Pause, Play, Mic } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useRadio } from '../context/RadioContext';
import { formatTime } from '../utils/helpers';
import PoliceScanner from './PoliceScanner';

function ConnectionBadge({ wsStatus, dark }: { wsStatus: string; dark: boolean }) {
  switch (wsStatus) {
    case 'connected':
      return (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-500 fluid-text-xs font-medium">LIVE</span>
        </div>
      );
    case 'mock':
      return (
        <div className="flex items-center gap-1 ml-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-amber-500 fluid-text-xs font-medium">MOCK</span>
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

export default function RadioFeed() {
  const { theme } = useTheme();
  const { entries, isLive, toggleLive, isSpeaking, wsStatus } = useRadio();
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  const filtered = search
    ? entries.filter(e =>
        e.text.toLowerCase().includes(search.toLowerCase()) ||
        e.speaker.toLowerCase().includes(search.toLowerCase()) ||
        e.channel.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  useEffect(() => {
    if (isLive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, isLive]);

  const urgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return 'text-red-500';
      case 'caution': return 'text-amber-500';
      default: return dark ? 'text-green-400' : 'text-green-600';
    }
  };

  const urgencyBg = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return dark ? 'bg-red-500/10 border-l-2 border-red-500' : 'bg-red-50 border-l-2 border-red-500';
      case 'caution': return dark ? 'bg-amber-500/5 border-l-2 border-amber-500' : 'bg-amber-50 border-l-2 border-amber-500';
      default: return '';
    }
  };

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden ${dark ? 'card-dark' : 'card-light'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
          <h2 className="font-semibold fluid-text-sm">Radio Feed</h2>
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Search transcriptions..."
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
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1"
      >
        {filtered.map(entry => (
          <div
            key={entry.id}
            className={`px-2.5 py-2 rounded-lg ${urgencyBg(entry.urgency)} animate-fade-in`}
          >
            <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
              <span className={`font-mono fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                [{formatTime(entry.timestamp)}]
              </span>
              <span className={`font-semibold fluid-text-xs ${urgencyColor(entry.urgency)}`}>
                {entry.speaker}
              </span>
              <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-300'}`}>
                {entry.channel}
              </span>
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
        ))}
      </div>
    </div>
  );
}
