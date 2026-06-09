import { Loader2, Lock, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import AuthShell from './AuthShell';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  return (
    <div
      className={`min-h-dvh flex flex-col items-center justify-center gap-3 ${
        dark ? 'bg-surface-dark text-neutral-400' : 'bg-surface-light text-neutral-500'
      }`}
    >
      <Loader2 className="w-6 h-6 animate-spin text-gold-500" />
      <p className="fluid-text-sm">{label}</p>
    </div>
  );
}

export function NotConfiguredNotice() {
  return (
    <AuthShell
      title="Backend not connected yet"
      subtitle="Accounts and the officer portal activate once Supabase is configured for this deployment."
      footer={
        <Link to="/" className="inline-flex items-center gap-1.5 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to the dashboard (demo mode)
        </Link>
      }
    >
      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 text-amber-600">
        <Lock className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="fluid-text-sm">
          Add <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> (plus the server keys) to enable
          sign-in, business accounts, and the public-safety officer tools.
        </p>
      </div>
    </AuthShell>
  );
}

export function UnauthorizedNotice() {
  return (
    <AuthShell
      title="Officer access required"
      subtitle="This area is limited to public-safety officers. Ask an administrator to invite your email."
      footer={
        <Link to="/" className="inline-flex items-center gap-1.5 hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to the dashboard
        </Link>
      }
    >
      <div className="flex items-start gap-3 p-3 rounded-xl bg-red-500/10 text-red-500">
        <ShieldAlert className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <p className="fluid-text-sm">
          Your account doesn’t have the officer role. If you were invited, sign out and back in to
          refresh your permissions.
        </p>
      </div>
    </AuthShell>
  );
}
