import { useState } from 'react';
import { UserCog, KeyRound, Loader2, Check, LogOut, BadgeCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import PortalShell from '../components/PortalShell';
import PasskeyManager from '../components/PasskeyManager';
import type { Role } from '../types';

const roleLabel: Record<Role, string> = {
  business: 'Business',
  officer: 'Public Safety',
  admin: 'Administrator',
};

export default function AccountPage() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { user, profile, role, signOut, refreshProfile } = useAuth();

  const [name, setName] = useState(profile?.display_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveName = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() || null })
      .eq('id', user.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      await refreshProfile();
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <PortalShell title="Your account" eyebrow="Settings" icon={<UserCog className="w-6 h-6" />}>
      <div className="grid gap-5 sm:grid-cols-2">
        <Card dark={dark} title="Profile" icon={<BadgeCheck className="w-4 h-4" />}>
          <Field label="Email" dark={dark}>
            <p className="fluid-text-sm font-medium">{user?.email ?? '—'}</p>
          </Field>
          <Field label="Role" dark={dark}>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full fluid-text-xs font-semibold ${
                role === 'admin'
                  ? 'bg-gold-500/15 text-gold-600'
                  : role === 'officer'
                    ? 'bg-navy-500/15 text-navy-500'
                    : dark
                      ? 'bg-white/10 text-neutral-300'
                      : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              {role ? roleLabel[role] : '—'}
            </span>
          </Field>
          <Field label="Display name" dark={dark}>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={`flex-1 px-3 py-2 rounded-lg outline-none fluid-text-sm ${
                  dark
                    ? 'bg-white/5 border border-white/10 text-neutral-200 focus:border-gold-500/50'
                    : 'bg-neutral-50 border border-neutral-200 text-neutral-700 focus:border-navy-400'
                }`}
              />
              <button
                onClick={saveName}
                disabled={saving}
                className={`tap-target px-3 py-2 rounded-lg font-semibold fluid-text-sm flex items-center gap-1.5 ${
                  dark ? 'bg-white/10 hover:bg-white/15 text-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : null}
                {saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </Field>
        </Card>

        <Card dark={dark} title="Passkeys" icon={<KeyRound className="w-4 h-4" />}>
          <PasskeyManager />
        </Card>
      </div>

      <button
        onClick={() => signOut()}
        className={`mt-6 tap-target inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold fluid-text-sm transition-colors ${
          dark ? 'bg-white/5 hover:bg-red-500/20 text-neutral-300 hover:text-red-400' : 'bg-neutral-100 hover:bg-red-50 text-neutral-700 hover:text-red-500'
        }`}
      >
        <LogOut className="w-4 h-4" />
        Sign out
      </button>
    </PortalShell>
  );
}

function Card({
  title,
  icon,
  children,
  dark,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  dark: boolean;
}) {
  return (
    <section
      className={`rounded-2xl p-5 ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-sm border border-neutral-100'}`}
    >
      <h3 className={`flex items-center gap-2 font-bold fluid-text-base mb-4 ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>
        <span className={dark ? 'text-gold-400' : 'text-navy-600'}>{icon}</span>
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  dark,
}: {
  label: string;
  children: React.ReactNode;
  dark: boolean;
}) {
  return (
    <div>
      <p className={`fluid-text-xs font-medium uppercase tracking-wide mb-1.5 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
        {label}
      </p>
      {children}
    </div>
  );
}
