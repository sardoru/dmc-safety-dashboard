import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, Hand, Mail, Send, Ticket } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAppSettings } from '../hooks/useAppSettings';
import { apiFetch } from '../lib/api';
import Logo from '../components/brand/Logo';
import BrandImage from '../components/brand/BrandImage';
import { Button } from '../components/ui/Button';
import { Banner } from '../components/ui/Feedback';

type Step = 'code' | 'request' | 'sent' | 'requested';

/** Public: join with an access code, or (invite-only) ask to join. */
export default function JoinPage() {
  const { isDemo, email: myEmail } = useAuth();
  const { settings } = useAppSettings();
  const [params] = useSearchParams();
  // From the sign-in page: the address they tried, and whether to ask to join.
  const carried = useLocation().state as { email?: string; ask?: boolean } | null;
  const [step, setStep] = useState<Step>(() => (carried?.ask && !params.get('code') ? 'request' : 'code'));
  const [code, setCode] = useState(() => (params.get('code') ?? '').toUpperCase().slice(0, 32));
  const [email, setEmail] = useState(carried?.email ?? myEmail ?? '');
  const [name, setName] = useState('');
  const [organization, setOrganization] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inviteOnly = settings.signupMode === 'invite';

  const redeem = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!isDemo) await apiFetch('/api/join', { method: 'POST', json: { action: 'redeem', code, email, website } });
      setStep('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check that code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const request = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!isDemo) await apiFetch('/api/join', { method: 'POST', json: { action: 'waitlist', email, name, organization, note, website } });
      setStep('requested');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const honeypot = (
    <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
    </div>
  );

  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Sign in
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {step === 'sent' || step === 'requested' ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                <CircleCheck className="h-8 w-8" />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">
                {step === 'sent' ? 'Check your email' : 'Request sent'}
              </h1>
              <p className="mt-2 text-[15px] text-muted">
                {step === 'sent' ? (
                  <>
                    We sent a one-tap link to <span className="font-semibold text-ink">{email}</span>. Open it on this device to finish
                    joining — no password needed.
                  </>
                ) : (
                  <>Thanks — an administrator will review it. You’ll get an email at <span className="font-semibold text-ink">{email}</span> when you’re approved.</>
                )}
              </p>
              {isDemo && <p className="mt-3 text-[13px] text-subtle">Demo mode: nothing was sent.</p>}
              <Link to="/" className="mt-6 inline-block text-sm font-semibold text-accent-strong hover:underline">
                Back to the dashboard
              </Link>
            </div>
          ) : step === 'request' ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight text-ink">Ask to join</h1>
              <p className="mt-2 text-[15px] text-muted">
                Membership is by invitation. Tell us who you are — an administrator reviews every request.
              </p>
              <form onSubmit={(e) => void request(e)} className="relative mt-8 space-y-4">
                {honeypot}
                <div>
                  <label htmlFor="name" className="label">Your name</label>
                  <input id="name" className="input h-12 text-[15px]" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={120} />
                </div>
                <div>
                  <label htmlFor="org" className="label">Business or organization</label>
                  <input id="org" className="input h-12 text-[15px]" value={organization} onChange={(e) => setOrganization(e.target.value)} autoComplete="organization" placeholder="Riverbluff Coffee Co." maxLength={160} />
                </div>
                <div>
                  <label htmlFor="email" className="label">Work email</label>
                  <input id="email" type="email" className="input h-12 text-[15px]" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@business.com" required />
                </div>
                <div>
                  <label htmlFor="note" className="label">Anything we should know? <span className="font-normal text-subtle">(optional)</span></label>
                  <textarea id="note" className="input min-h-[88px] py-3 text-[15px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Where you are downtown, and why you’d like to join." />
                </div>
                {error && <Banner tone="danger">{error}</Banner>}
                <Button type="submit" block size="lg" loading={busy} icon={<Send className="h-4 w-4" />}>
                  Send request
                </Button>
                <button type="button" onClick={() => setStep('code')} className="w-full text-center text-sm font-semibold text-accent-strong hover:underline">
                  I have an access code
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
                <Ticket className="h-6 w-6" />
              </span>
              <h1 className="text-3xl font-bold tracking-tight text-ink">Join with an access code</h1>
              <p className="mt-2 text-[15px] text-muted">
                Got a code from the Downtown safety team or your business association? Enter it with your work email.
              </p>
              <form onSubmit={(e) => void redeem(e)} className="relative mt-8 space-y-4">
                {honeypot}
                <div>
                  <label htmlFor="code" className="label">Access code</label>
                  <input
                    id="code"
                    className="input h-12 font-mono text-lg tracking-[0.12em] uppercase"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setError('');
                    }}
                    placeholder="K7QM-2XRT"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                    maxLength={32}
                  />
                </div>
                <div>
                  <label htmlFor="join-email" className="label">Work email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                    <input
                      id="join-email"
                      type="email"
                      className="input h-12 pl-10 text-[15px]"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      autoComplete="email"
                      placeholder="you@business.com"
                      required
                    />
                  </div>
                </div>
                {error && <Banner tone="danger">{error}</Banner>}
                <Button type="submit" block size="lg" loading={busy} disabled={!code.trim() || !email.trim()} icon={<Send className="h-4 w-4" />}>
                  Join
                </Button>
              </form>
              <div className="mt-8 border-t border-line pt-6 text-[13px] text-muted">
                {inviteOnly ? (
                  <p className="flex gap-2.5">
                    <Hand className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                    <span>
                      No code?{' '}
                      <button type="button" onClick={() => setStep('request')} className="font-semibold text-accent-strong hover:underline">
                        Ask to join
                      </button>{' '}
                      and an administrator will review it.
                    </span>
                  </p>
                ) : (
                  <p className="flex gap-2.5">
                    <Hand className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                    <span>
                      No code? Businesses can{' '}
                      <Link to="/login" className="font-semibold text-accent-strong hover:underline">
                        sign up with just their email
                      </Link>
                      .
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[12px] text-subtle">Emergency? Call 911. This dashboard does not dispatch emergency services.</p>
      </div>

      <div className="relative hidden overflow-hidden bg-brand-night lg:block">
        <BrandImage name="mainStreet" width={1080} priority alt="" sizes="50vw" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/90 via-navy-950/30 to-navy-950/10" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="max-w-md text-3xl font-bold leading-tight tracking-tight">Join the people watching out for Downtown.</p>
          <p className="mt-3 text-sm text-navy-100">A self-regulated safety dashboard · Memphis, TN</p>
        </div>
      </div>
    </div>
  );
}
