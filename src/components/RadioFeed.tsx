import { useEffect, useRef, useState } from 'react';
import { Radio, Search, X, Pause, Play } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useRadio } from '../context/RadioContext';
import { formatTime } from '../utils/helpers';

export default function RadioFeed() {
  const { theme } = useTheme();
  const { entries, isLive, toggleLive } = useRadio();
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const dark = theme === 'dark';

  const filtered = search
    ? entries.filter(e =>
        e.text.toLowerCase().includes(search.toLowerCase()) ||
        e.speaker.toLowerCase().includes(search.toLowerCase())
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
          {isLive && (
            <div className="flex items-center gap-1 ml-1">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-500 fluid-text-xs font-medium">LIVE</span>
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
            <div className="flex items-baseline gap-2 mb-0.5">
              <span className={`font-mono fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                [{formatTime(entry.timestamp)}]
              </span>
              <span className={`font-semibold fluid-text-xs ${urgencyColor(entry.urgency)}`}>
                {entry.speaker}
              </span>
              <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-300'}`}>
                {entry.channel}
              </span>
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
