import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronDown, LogOut, Moon, Phone, Sun, FlaskConical } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useIncidents } from '../../context/IncidentContext';
import { useProfile } from '../../context/ProfileContext';
import { isOpen } from '../../lib/taxonomy';
import { cn } from '../../lib/format';
import Logo, { LogoMark } from '../brand/Logo';
import { Avatar, LiveDot } from '../ui/Misc';
import { IconButton } from '../ui/Button';
import { Spinner } from '../ui/Feedback';
import ErrorBoundary from '../ErrorBoundary';
import { navFor, ROLE_LABEL } from './nav';
import type { Role } from '../../types';

function DemoBar() {
  const { isDemo, role, setDemoRole } = useAuth();
  const { resetDemo } = useIncidents();
  const [open, setOpen] = useState(false);
  if (!isDemo) return null;
  return (
    <div className="relative z-40 flex items-center justify-center gap-2 bg-navy-900 px-3 py-1.5 text-[12px] text-navy-100">
      <FlaskConical className="h-3.5 w-3.5 text-gold-300" aria-hidden />
      <span className="truncate">
        <span className="font-semibold text-white">Demo mode</span>
        <span className="hidden sm:inline"> · sample data, nothing is sent to officers</span>
      </span>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 font-semibold text-white hover:bg-white/15"
          aria-expanded={open}
        >
          Viewing as {role ? ROLE_LABEL[role] : '—'}
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {open && (
          <div className="absolute left-1/2 top-full z-50 mt-1.5 w-56 -translate-x-1/2 rounded-xl border border-line bg-surface p-1 text-ink shadow-pop">
            {(['business', 'officer', 'admin'] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => {
                  setDemoRole(r);
                  setOpen(false);
                }}
                className={cn('flex w-full items-center rounded-lg px-3 py-2 text-left text-[13px] hover:bg-surface-2', r === role && 'font-semibold text-accent-strong')}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
            {resetDemo && (
              <button
                onClick={() => {
                  resetDemo();
                  setOpen(false);
                }}
                className="mt-1 flex w-full items-center rounded-lg border-t border-line px-3 py-2 text-left text-[13px] text-muted hover:bg-surface-2"
              >
                Reset sample data
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar() {
  const { role, displayName, signOut, isDemo } = useAuth();
  const { profile } = useProfile();
  const { incidents } = useIncidents();
  const { theme, toggleTheme } = useTheme();
  const items = navFor(role);
  const openNew = incidents.filter((i) => i.status === 'active').length;

  return (
    <aside className="hidden w-[256px] flex-shrink-0 flex-col border-r border-line bg-surface lg:flex">
      <Link to="/" className="flex h-16 items-center border-b border-line px-5">
        <Logo />
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {items.map((item) => {
          const Icon = item.icon;
          if (item.primary) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'my-2 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold shadow-sm transition-colors',
                    isActive ? 'bg-primary-hover text-primary-ink' : 'bg-primary text-primary-ink hover:bg-primary-hover',
                  )
                }
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {item.label}
              </NavLink>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-[18px] w-[18px]', isActive && 'text-accent-strong')} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/ops' && openNew > 0 && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular">{openNew}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <a
          href="tel:911"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-700 transition-colors hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/15"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
            <Phone className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-bold">Emergency? Call 911</span>
            <span className="block text-[11px] opacity-80">This dashboard is not 911</span>
          </span>
        </a>
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
          <Avatar name={displayName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink">{displayName}</p>
            <p className="truncate text-[11px] text-muted">
              {role === 'business' && profile ? profile.businessName : role ? ROLE_LABEL[role] : ''}
            </p>
          </div>
          <IconButton label={theme === 'dark' ? 'Light mode' : 'Dark mode'} size="sm" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>
          <IconButton label={isDemo ? 'Leave demo' : 'Sign out'} size="sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const { theme, toggleTheme } = useTheme();
  const { displayName, isDemo } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/90 px-3 backdrop-blur-lg lg:hidden">
      <Link to="/" className="flex min-w-0 items-center gap-2">
        <LogoMark className="h-8 w-8" />
        <span className="truncate text-[15px] font-bold tracking-tight text-ink">Downtown Safety</span>
      </Link>
      <div className="flex items-center gap-1">
        {!isDemo && (
          <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <LiveDot /> Live
          </span>
        )}
        <a href="tel:911" className="inline-flex h-9 items-center gap-1 rounded-xl bg-red-600 px-2.5 text-[12px] font-bold text-white" aria-label="Call 911">
          <Phone className="h-3.5 w-3.5" /> 911
        </a>
        <IconButton label="Toggle theme" size="sm" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconButton>
        <Link to="/account" aria-label="Settings">
          <Avatar name={displayName} size="sm" />
        </Link>
      </div>
    </header>
  );
}

function MobileTabs() {
  const { role } = useAuth();
  const { incidents } = useIncidents();
  const items = navFor(role).filter((n) => n.to !== '/admin' && n.to !== '/account').slice(0, 4);
  const openNew = incidents.filter((i) => isOpen(i.status) && i.status === 'active').length;
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-lg lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
                  item.primary ? 'text-primary-ink' : isActive ? 'text-ink' : 'text-subtle',
                )
              }
            >
              {({ isActive }) =>
                item.primary ? (
                  <>
                    <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-ink shadow-pop ring-4 ring-surface">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-ink">{item.short}</span>
                  </>
                ) : (
                  <>
                    <span className="relative">
                      <Icon className={cn('h-5 w-5', isActive && 'text-accent-strong')} />
                      {item.to === '/ops' && openNew > 0 && (
                        <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                          {openNew}
                        </span>
                      )}
                    </span>
                    {item.short}
                    {isActive && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" />}
                  </>
                )
              }
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

/** Signed-in layout: sidebar (desktop) / top bar + tabs (mobile) around the routed page. */
export default function AppShell() {
  const location = useLocation();
  const fullBleed = location.pathname.startsWith('/ops');
  return (
    <div className="flex h-dvh flex-col bg-bg">
      <DemoBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <main
            id="main"
            className={cn(
              'min-h-0 flex-1',
              fullBleed ? 'overflow-hidden pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0' : 'overflow-y-auto pb-[calc(84px+env(safe-area-inset-bottom))] lg:pb-0',
            )}
          >
            <ErrorBoundary key={location.pathname} label={location.pathname}>
              <Suspense fallback={<div className="flex h-full items-center justify-center p-10"><Spinner label="Loading…" /></div>}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </div>
      <MobileTabs />
    </div>
  );
}
