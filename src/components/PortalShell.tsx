import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Shield, LayoutDashboard, Sun, Moon, LogOut } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

interface PortalShellProps {
  title: string;
  icon?: ReactNode;
  /** Short role/eyebrow label shown above the title. */
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function PortalShell({ title, icon, eyebrow, actions, children }: PortalShellProps) {
  const { theme, toggleTheme } = useTheme();
  const { profile, signOut, configured } = useAuth();
  const dark = theme === 'dark';

  return (
    <div
      className={`min-h-dvh flex flex-col ${
        dark ? 'bg-surface-dark text-neutral-200' : 'bg-surface-light text-neutral-800'
      }`}
    >
      <header
        className={`w-full px-4 py-2.5 sm:px-6 flex items-center justify-between gap-3 ${
          dark ? 'glass-dark' : 'card-light'
        }`}
      >
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-navy-600">
            <Shield className="w-5 h-5 text-gold-400" />
          </div>
          <div className="min-w-0">
            <h1 className={`fluid-text-base font-bold leading-tight ${dark ? 'text-gold-400' : 'text-navy-600'}`}>
              DMC Safety
            </h1>
            <p className={`fluid-text-xs hidden sm:block ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              Downtown Memphis Commission
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to="/"
            className={`tap-target hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl fluid-text-sm font-medium transition-colors ${
              dark ? 'bg-white/5 hover:bg-white/10 text-neutral-300' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <button
            onClick={toggleTheme}
            className={`tap-target flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
              dark ? 'bg-neutral-800 hover:bg-neutral-700 text-gold-400' : 'bg-neutral-100 hover:bg-neutral-200 text-navy-600'
            }`}
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {configured && profile && (
            <button
              onClick={() => signOut()}
              className={`tap-target flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                dark ? 'bg-neutral-800 hover:bg-red-500/20 text-neutral-300 hover:text-red-400' : 'bg-neutral-100 hover:bg-red-50 text-neutral-600 hover:text-red-500'
              }`}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div
                  className={`p-2.5 rounded-xl flex-shrink-0 ${
                    dark ? 'bg-white/5 text-gold-400' : 'bg-navy-50 text-navy-600'
                  }`}
                >
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {eyebrow && (
                  <p className={`fluid-text-xs font-semibold uppercase tracking-wide ${dark ? 'text-gold-500' : 'text-navy-500'}`}>
                    {eyebrow}
                  </p>
                )}
                <h2 className="fluid-text-2xl font-bold leading-tight truncate">{title}</h2>
              </div>
            </div>
            {actions && <div className="flex-shrink-0">{actions}</div>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
