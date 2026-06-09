import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Mail,
  Loader2,
  Send,
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { loginWithPasskey, passkeysSupported } from '../lib/passkeys';
import AuthShell from '../components/auth/AuthShell';

export default function LoginPage() {
  const { theme } = useTheme();
  const { session, sendMagicLink } = useAuth();
  const dark = theme === 'dark';
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, from, navigate]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setStatus('sending');
    try {
      await sendMagicLink(email);
      setStatus('sent');
    } catch (err) {
      setStatus('idle');
      setError(err instanceof Error ? err.message : 'Could not send the link. Try again.');
    }
  };

  const handlePasskey = async () => {
    setError('');
    setPasskeyBusy(true);
    try {
      await loginWithPasskey(email.trim() ? email : undefined);
      navigate(from, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Passkey sign-in failed: ${err.message}`
          : 'Passkey sign-in was cancelled or failed.',
      );
    } finally {
      setPasskeyBusy(false);
    }
  };

  const inputClass = `w-full pl-10 pr-3 py-3 rounded-xl outline-none fluid-text-sm ${
    dark
      ? 'bg-white/5 text-neutral-200 placeholder:text-neutral-600 border border-white/10 focus:border-gold-500/50'
      : 'bg-neutral-50 text-neutral-700 placeholder:text-neutral-400 border border-neutral-200 focus:border-navy-400'
  }`;

  if (status === 'sent') {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We sent a secure sign-in link to ${email}. It expires in 1 hour.`}
        footer={
          <button onClick={() => setStatus('idle')} className="hover:underline">
            Use a different email
          </button>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-16 h-16 mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <p className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            Open the email on this device and tap <span className="font-semibold">Sign in</span>. You
            can close this tab.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Sign in"
      subtitle="Businesses and public-safety officers use a secure link or a passkey — no passwords."
      footer={
        <Link to="/" className="hover:underline">
          Continue to the public dashboard →
        </Link>
      }
    >
      <form onSubmit={handleMagicLink} className="space-y-3">
        <div className="relative">
          <Mail
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              dark ? 'text-neutral-500' : 'text-neutral-400'
            }`}
          />
          <input
            type="email"
            autoComplete="email webauthn"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError('');
            }}
            placeholder="you@business.com"
            className={inputClass}
            required
          />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={status === 'sending' || !email.trim()}
          className={`w-full tap-target py-3 rounded-xl font-bold fluid-text-base transition-all flex items-center justify-center gap-2 ${
            email.trim() && status !== 'sending'
              ? 'bg-navy-600 hover:bg-navy-700 text-white active:scale-[0.98]'
              : dark
                ? 'bg-white/5 text-neutral-600 cursor-not-allowed'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
          }`}
        >
          {status === 'sending' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {status === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
        </button>
      </form>

      {passkeysSupported() && (
        <>
          <div className="flex items-center gap-3 my-4">
            <div className={`h-px flex-1 ${dark ? 'bg-white/10' : 'bg-neutral-200'}`} />
            <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
              or
            </span>
            <div className={`h-px flex-1 ${dark ? 'bg-white/10' : 'bg-neutral-200'}`} />
          </div>

          <button
            onClick={handlePasskey}
            disabled={passkeyBusy}
            className={`w-full tap-target py-3 rounded-xl font-semibold fluid-text-sm transition-all flex items-center justify-center gap-2 border ${
              dark
                ? 'border-white/15 hover:bg-white/5 text-neutral-200'
                : 'border-neutral-200 hover:bg-neutral-50 text-neutral-700'
            } ${passkeyBusy ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'}`}
          >
            {passkeyBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <KeyRound className="w-4 h-4 text-gold-500" />
            )}
            Sign in with a passkey
          </button>
        </>
      )}

      <div
        className={`mt-6 pt-5 border-t space-y-2.5 ${
          dark ? 'border-white/10' : 'border-neutral-100'
        }`}
      >
        <InfoLine
          icon={<Building2 className="w-4 h-4 text-navy-500" />}
          dark={dark}
          text="New business? Entering your email creates your account — set up your storefront after you sign in."
        />
        <InfoLine
          icon={<ShieldCheck className="w-4 h-4 text-gold-500" />}
          dark={dark}
          text="Public-safety officers: use the email your administrator invited."
        />
      </div>
    </AuthShell>
  );
}

function InfoLine({
  icon,
  text,
  dark,
}: {
  icon: React.ReactNode;
  text: string;
  dark: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <p className={`fluid-text-xs leading-relaxed ${dark ? 'text-neutral-500' : 'text-neutral-500'}`}>
        {text}
      </p>
    </div>
  );
}
