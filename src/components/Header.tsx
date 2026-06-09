import { useCallback, useEffect, useRef, useState } from 'react';
import { Shield, AlertTriangle, Building2, Radio, Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { useProfile } from '../context/ProfileContext';
import { useRadio } from '../context/RadioContext';
import { useBusinesses } from '../hooks/useBusinesses';
import AccountMenu from './AccountMenu';
import type { RadioHealthResponse } from '../types';

const HEALTH_URL = import.meta.env.VITE_RADIO_HTTP_URL || 'http://localhost:8766';

function RadioStatusPill({ dark }: { dark: boolean }) {
  const { wsStatus } = useRadio();
  const [showPopover, setShowPopover] = useState(false);
  const [health, setHealth] = useState<RadioHealthResponse | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${HEALTH_URL}/api/health`);
      if (res.ok) {
        setHealth(await res.json());
      }
    } catch {
      setHealth(null);
    }
  }, []);

  useEffect(() => {
    if (showPopover) fetchHealth();
  }, [showPopover, fetchHealth]);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  let label: string;
  let dotColor: string;
  let textColor: string;
  switch (wsStatus) {
    case 'connected':
      label = 'Radio: LIVE';
      dotColor = 'bg-green-500 animate-pulse';
      textColor = 'text-green-500';
      break;
    case 'mock':
      label = 'Radio: MOCK';
      dotColor = 'bg-amber-500';
      textColor = 'text-amber-500';
      break;
    case 'connecting':
      label = 'Radio: Connecting';
      dotColor = 'bg-blue-400 animate-pulse';
      textColor = dark ? 'text-blue-400' : 'text-blue-500';
      break;
    default:
      label = 'Radio: Offline';
      dotColor = 'bg-red-500';
      textColor = 'text-red-500';
  }

  const wsUrl = import.meta.env.VITE_RADIO_WS_URL || 'ws://localhost:8765';

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setShowPopover(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
          dark ? 'bg-white/5 hover:bg-white/10' : 'bg-neutral-100 hover:bg-neutral-200'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <Radio className={`w-3.5 h-3.5 ${textColor}`} />
        <span className={`fluid-text-xs font-medium ${textColor}`}>{label}</span>
      </button>

      {showPopover && (
        <div className={`absolute right-0 top-full mt-2 w-64 rounded-xl shadow-lg border z-50 p-4 ${
          dark ? 'bg-neutral-900 border-white/10' : 'bg-white border-neutral-200'
        }`}>
          <h4 className={`font-semibold fluid-text-sm mb-3 ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>
            Radio Connection
          </h4>
          <div className="space-y-2">
            <InfoRow label="WebSocket URL" value={wsUrl} dark={dark} />
            <InfoRow label="Status" value={wsStatus} dark={dark} />
            {health ? (
              <>
                <InfoRow label="Uptime" value={formatUptime(health.uptime)} dark={dark} />
                <InfoRow label="Transcriptions" value={String(health.transcriptions_count)} dark={dark} />
                <InfoRow label="Clients" value={String(health.clients_connected)} dark={dark} />
              </>
            ) : (
              <p className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Health data unavailable
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, dark }: { label: string; value: string; dark: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>{label}</span>
      <span className={`fluid-text-xs font-medium text-right break-all ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>{value}</span>
    </div>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { activeAlerts, last24hCount } = useAlerts();
  const { profile } = useProfile();
  const businesses = useBusinesses();
  const dark = theme === 'dark';

  const businessCount =
    businesses.length + (profile && !businesses.some((b) => b.id === profile.id) ? 1 : 0);

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
            Core Downtown Memphis
          </h1>
          <p className={`fluid-text-xs hidden sm:block ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
            Safety Dashboard
          </p>
        </div>
      </div>

      {/* Center: Stats (hidden on mobile, shown on md+) */}
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
        <RadioStatusPill dark={dark} />
      </div>

      {/* Right: User greeting + theme toggle */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Show pill on small screens that hide the center stats */}
        <div className="md:hidden">
          <RadioStatusPill dark={dark} />
        </div>
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
        <AccountMenu />
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
