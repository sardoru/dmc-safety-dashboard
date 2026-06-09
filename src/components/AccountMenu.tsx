import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ShieldCheck, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { Role } from '../types';

const roleLabel: Record<Role, string> = {
  business: 'Business',
  officer: 'Public Safety',
  admin: 'Administrator',
};

export default function AccountMenu() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { profile, user, role, isOfficer, isAdmin, signOut, configured, session } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!configured || !session) return null;

  const display = profile?.display_name || user?.email || 'Account';
  const initial = display.charAt(0).toUpperCase();

  const itemClass = `flex items-center gap-2.5 px-3 py-2.5 fluid-text-sm transition-colors ${
    dark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-neutral-50 text-neutral-700'
  }`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`tap-target flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full transition-colors ${
          dark ? 'bg-white/5 hover:bg-white/10' : 'bg-neutral-100 hover:bg-neutral-200'
        }`}
        aria-label="Account menu"
      >
        <span className="w-8 h-8 rounded-full bg-navy-600 text-gold-400 flex items-center justify-center font-bold fluid-text-sm">
          {initial}
        </span>
        <ChevronDown className={`w-4 h-4 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`} />
      </button>

      {open && (
        <div
          className={`absolute right-0 top-full mt-2 w-60 rounded-xl shadow-lg border z-50 overflow-hidden ${
            dark ? 'bg-neutral-900 border-white/10' : 'bg-white border-neutral-200'
          }`}
        >
          <div className={`px-3 py-3 border-b ${dark ? 'border-white/10' : 'border-neutral-100'}`}>
            <p className="fluid-text-sm font-semibold truncate">{display}</p>
            <p className={`fluid-text-xs truncate ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {user?.email}
            </p>
            {role && (
              <span
                className={`inline-block mt-1.5 px-2 py-0.5 rounded-full fluid-text-xs font-semibold ${
                  role === 'admin'
                    ? 'bg-gold-500/15 text-gold-600'
                    : role === 'officer'
                      ? 'bg-navy-500/15 text-navy-500'
                      : dark
                        ? 'bg-white/10 text-neutral-300'
                        : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {roleLabel[role]}
              </span>
            )}
          </div>

          <div className="py-1" onClick={() => setOpen(false)}>
            {isOfficer && (
              <Link to="/officer" className={itemClass}>
                <Radio className="w-4 h-4 text-gold-500" />
                Officer Portal
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin" className={itemClass}>
                <ShieldCheck className="w-4 h-4 text-gold-500" />
                Administration
              </Link>
            )}
            <Link to="/account" className={itemClass}>
              <KeyRound className="w-4 h-4 text-gold-500" />
              Account &amp; passkeys
            </Link>
            <button
              onClick={() => signOut()}
              className={`w-full text-left ${itemClass} ${dark ? 'hover:!bg-red-500/15 hover:text-red-400' : 'hover:!bg-red-50 hover:text-red-500'}`}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
