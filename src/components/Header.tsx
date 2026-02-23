import { Shield, AlertTriangle, Building2, Radio, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { useProfile } from '../context/ProfileContext';
import { useRadio } from '../context/RadioContext';
import { mockBusinesses } from '../data/mockBusinesses';

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { activeAlerts, last24hCount } = useAlerts();
  const { profile } = useProfile();
  const { isLive } = useRadio();
  const dark = theme === 'dark';

  const businessCount = mockBusinesses.length + (profile ? 1 : 0);

  return (
    <header
      className={`
        w-full px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between gap-3 z-30
        ${dark ? 'glass-dark' : 'card-light'}
      `}
    >
      {/* Left: Branding */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className={`p-1.5 sm:p-2 rounded-lg ${dark ? 'bg-navy-600' : 'bg-navy-600'}`}>
          <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-gold-400" />
        </div>
        <div className="min-w-0">
          <h1 className="fluid-text-base sm:fluid-text-lg font-bold text-navy-600 dark:text-gold-400 truncate leading-tight">
            DMC Safety Dashboard
          </h1>
          <p className={`fluid-text-xs hidden sm:block ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            Downtown Memphis Commission
          </p>
        </div>
      </div>

      {/* Center: Stats (hidden on mobile, shown on sm+) */}
      <div className="hidden md:flex items-center gap-4 lg:gap-6">
        <StatBadge
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Active Alerts"
          value={activeAlerts.length}
          highlight={activeAlerts.length > 0}
          dark={dark}
        />
        <StatBadge
          icon={<Building2 className="w-4 h-4" />}
          label="Businesses"
          value={businessCount}
          dark={dark}
        />
        <StatBadge
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Last 24h"
          value={last24hCount}
          dark={dark}
        />
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <Radio className={`w-4 h-4 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`} />
          <span className={`fluid-text-xs font-medium ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            {isLive ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Right: User greeting + theme toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        {profile && (
          <span className={`fluid-text-sm hidden lg:block ${dark ? 'text-neutral-300' : 'text-neutral-600'}`}>
            Hello, <span className="font-semibold">{profile.contactName.split(' ')[0]}</span>
          </span>
        )}
        <button
          onClick={toggleTheme}
          className={`
            tap-target flex items-center justify-center w-10 h-10 rounded-xl transition-colors
            ${dark
              ? 'bg-neutral-800 hover:bg-neutral-700 text-gold-400'
              : 'bg-neutral-100 hover:bg-neutral-200 text-navy-600'}
          `}
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}

function StatBadge({
  icon,
  label,
  value,
  highlight,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  dark: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={highlight ? 'text-red-500' : dark ? 'text-neutral-400' : 'text-neutral-500'}>
        {icon}
      </span>
      <div className="flex flex-col">
        <span className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>{label}</span>
        <span className={`font-bold fluid-text-base leading-tight ${highlight ? 'text-red-500' : ''}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
