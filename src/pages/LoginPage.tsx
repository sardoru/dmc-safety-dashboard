import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CircleCheck, KeyRound, Mail, Send, ShieldCheck, UserCog } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { loginWithPasskey, passkeysSupported } from '../lib/passkeys';
import Logo from '../components/brand/Logo';
import BrandImage from '../components/brand/BrandImage';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Feedback';
import { homePathFor } from '../components/layout/nav';
import type { Role } from '../types';

export default function LoginPage() {
  const { session, sendMagicLink, isDemo, setDemoRole, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (session) navigate(from || (role ? homePathFor(role) : '/'), { replace: true });
  }, [session, from, role, navigate]);

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
      navigate(from || '/', { replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? `Passkey sign-in failed: ${err.message}` : 'Passkey sign-in was cancelled or failed.');
    } finally {
      setPasskeyBusy(false);
    }
  };

  const enterDemo = (r: Role) => {
    setDemoRole(r);
    navigate(from || homePathFor(r), { replace: true });
  };

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {isDemo ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-ink">Explore the demo</h1>
              <p className="mt-2 text-[15px] text-muted">
                This deployment isn’t connected to a database, so sign-in is simulated. Choose who you want to be — the data is sample data.
              </p>
              <div className="mt-8 space-y-3">
                {(
                  [
                    ['business', 'Business owner', 'Report incidents and follow them', Building2],
                    ['officer', 'Public-safety officer', 'Monitor and respond in the Operations Center', ShieldCheck],
                    ['admin', 'Administrator', 'Manage the team and system', UserCog],
                  ] as const
                ).map(([r, title, body, Icon]) => (
                  <button key={r} onClick={() => enterDemo(r)} className="card flex w-full items-center gap-4 p-4 text-left transition-all hover:border-line-strong hover:shadow-pop">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block font-semibold text-ink">{title}</span>
                      <span className="block text-[13px] text-muted">{body}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : status === 'sent' ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CircleCheck className="h-8 w-8" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">Check your inbox</h1>
              <p className="mt-2 text-[15px] text-muted">
                We sent a secure sign-in link to <span className="font-semibold text-ink">{email}</span>. It works once and expires in an hour.
              </p>
              <p className="mt-4 text-[13px] text-subtle">Open the email on this device and tap “Sign in”. You can close this tab.</p>
              <button onClick={() => setStatus('idle')} className="mt-6 text-sm font-semibold text-accent-strong hover:underline">
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-ink">Sign in</h1>
              <p className="mt-2 text-[15px] text-muted">Businesses and public-safety officers sign in with a secure email link or a passkey — no passwords.</p>

              <form onSubmit={handleMagicLink} className="mt-8 space-y-3">
                <label htmlFor="email" className="label">
                  Work email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email webauthn"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    placeholder="you@business.com"
                    className="input h-12 pl-10 text-[15px]"
                    required
                  />
                </div>
                {error && <Banner tone="danger">{error}</Banner>}
                <Button type="submit" block size="lg" loading={status === 'sending'} disabled={!email.trim()} icon={<Send className="h-4 w-4" />}>
                  {status === 'sending' ? 'Sending link…' : 'Email me a sign-in link'}
                </Button>
              </form>

              {passkeysSupported() && (
                <>
                  <div className="my-5 flex items-center gap-3 text-[12px] text-subtle">
                    <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
                  </div>
                  <Button variant="secondary" block size="lg" loading={passkeyBusy} icon={<KeyRound className="h-4 w-4 text-accent-strong" />} onClick={() => void handlePasskey()}>
                    Sign in with a passkey
                  </Button>
                </>
              )}

              <div className="mt-8 space-y-3 border-t border-line pt-6 text-[13px] text-muted">
                <p className="flex gap-2.5">
                  <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                  New business? Entering your email creates your account — set up your storefront right after.
                </p>
                <p className="flex gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                  Public-safety officers: use the email your administrator invited.
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[12px] text-subtle">Emergency? Call 911. This dashboard does not dispatch emergency services.</p>
      </div>

      {/* Visual */}
      <div className="relative hidden overflow-hidden bg-brand-night lg:block">
        <BrandImage name="mainStreet" width={1080} priority alt="" sizes="50vw" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-navy-950/10" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="max-w-md text-3xl font-bold leading-tight tracking-tight">See it. Say it. Downtown officers see it instantly.</p>
          <p className="mt-3 text-sm text-navy-100">Core Downtown Memphis Safety Dashboard · Memphis, TN</p>
          <div className="mt-8 flex gap-6 text-[13px] text-navy-100">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Live operations map
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold-400" /> AI voice reporting
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
