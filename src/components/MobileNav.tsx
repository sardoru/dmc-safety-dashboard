import { Map, Radio, AlertTriangle, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import type { MobileTab } from '../types';

interface MobileNavProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const tabs: { id: MobileTab; icon: React.ReactNode; label: string }[] = [
  { id: 'map', icon: <Map className="w-5 h-5" />, label: 'Map' },
  { id: 'radio', icon: <Radio className="w-5 h-5" />, label: 'Radio' },
  { id: 'alerts', icon: <AlertTriangle className="w-5 h-5" />, label: 'Alerts' },
  { id: 'profile', icon: <User className="w-5 h-5" />, label: 'Profile' },
];

export default function MobileNav({ activeTab, onTabChange }: MobileNavProps) {
  const { theme } = useTheme();
  const { activeAlerts } = useAlerts();
  const dark = theme === 'dark';

  return (
    <nav
      className={`
        md:hidden fixed bottom-0 left-0 right-0 z-40
        ${dark ? 'glass-dark' : 'bg-white border-t border-neutral-200 shadow-lg'}
      `}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                tap-target flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-colors relative
                ${isActive
                  ? dark
                    ? 'text-gold-400'
                    : 'text-navy-600'
                  : dark
                    ? 'text-neutral-500 hover:text-neutral-300'
                    : 'text-neutral-400 hover:text-neutral-600'
                }
              `}
            >
              <div className="relative">
                {tab.icon}
                {tab.id === 'alerts' && activeAlerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {activeAlerts.length}
                  </span>
                )}
              </div>
              <span className="fluid-text-xs font-medium">{tab.label}</span>
              {isActive && (
                <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full ${dark ? 'bg-gold-400' : 'bg-navy-600'}`} />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
