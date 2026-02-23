import { useEffect, useRef, useState } from 'react';
import { useTheme } from './context/ThemeContext';
import { useProfile } from './context/ProfileContext';
import { requestNotificationPermission } from './utils/helpers';
import Header from './components/Header';
import MapView from './components/MapView';
import RadioFeed from './components/RadioFeed';
import AlertHistory from './components/AlertHistory';
import CallForHelp from './components/CallForHelp';
import ProfileModal from './components/ProfileModal';
import ProfilePage from './components/ProfilePage';
import MobileNav from './components/MobileNav';
import type { MobileTab } from './types';

export default function App() {
  const { theme } = useTheme();
  const { isRegistered } = useProfile();
  const [showRegistration, setShowRegistration] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('map');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const dark = theme === 'dark';

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!isRegistered) {
      const timer = setTimeout(() => setShowRegistration(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isRegistered]);

  const handleFocusAlert = (lat: number, lng: number) => {
    flyToRef.current?.(lat, lng);
    setMobileTab('map');
  };

  return (
    <div className={`h-dvh flex flex-col overflow-hidden ${dark ? 'bg-surface-dark text-neutral-200' : 'bg-surface-light text-neutral-800'}`}>
      <Header />

      <main className="flex-1 flex overflow-hidden">
        {/* Desktop layout */}
        <div className="hidden md:flex flex-1 overflow-hidden gap-0">
          {/* Left sidebar: Radio feed */}
          <div
            className={`
              transition-all duration-300 overflow-hidden flex-shrink-0
              ${leftCollapsed ? 'w-0' : 'w-[320px] lg:w-[360px]'}
            `}
          >
            <div className="h-full p-2 pl-2 pr-1">
              <RadioFeed />
            </div>
          </div>

          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className={`
              hidden md:flex items-center justify-center w-5 flex-shrink-0 transition-colors z-10
              ${dark ? 'text-neutral-600 hover:text-neutral-400 hover:bg-white/5' : 'text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100'}
            `}
            title={leftCollapsed ? 'Show radio feed' : 'Hide radio feed'}
          >
            <span className="text-xs">{leftCollapsed ? '›' : '‹'}</span>
          </button>

          {/* Center: Map */}
          <div className="flex-1 p-2 min-w-0">
            <MapView flyToRef={flyToRef} />
          </div>

          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className={`
              hidden md:flex items-center justify-center w-5 flex-shrink-0 transition-colors z-10
              ${dark ? 'text-neutral-600 hover:text-neutral-400 hover:bg-white/5' : 'text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100'}
            `}
            title={rightCollapsed ? 'Show alert history' : 'Hide alert history'}
          >
            <span className="text-xs">{rightCollapsed ? '‹' : '›'}</span>
          </button>

          {/* Right sidebar: Alert history */}
          <div
            className={`
              transition-all duration-300 overflow-hidden flex-shrink-0
              ${rightCollapsed ? 'w-0' : 'w-[320px] lg:w-[360px]'}
            `}
          >
            <div className="h-full p-2 pr-2 pl-1">
              <AlertHistory onFocusAlert={handleFocusAlert} />
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="md:hidden flex-1 overflow-hidden">
          <div className="h-full p-2 pb-16">
            {mobileTab === 'map' && <MapView flyToRef={flyToRef} />}
            {mobileTab === 'radio' && <RadioFeed />}
            {mobileTab === 'alerts' && <AlertHistory onFocusAlert={handleFocusAlert} />}
            {mobileTab === 'profile' && <ProfilePage />}
          </div>
        </div>
      </main>

      <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />

      <CallForHelp />

      <ProfileModal isOpen={showRegistration && !isRegistered} onClose={() => setShowRegistration(false)} />
    </div>
  );
}
