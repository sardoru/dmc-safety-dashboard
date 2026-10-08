import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  Building2,
  Eye,
  Lock,
  Map as MapIcon,
  Mic,
  Moon,
  Phone,
  ScanEye,
  Scale,
  ShieldCheck,
  Sun,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useIncidents } from '../context/IncidentContext';
import { useNow } from '../hooks/useNow';
import type { Role } from '../types';
import { isOpen } from '../lib/taxonomy';
import { cn } from '../lib/format';
import Logo, { LogoMark } from '../components/brand/Logo';
import BrandImage from '../components/brand/BrandImage';
import PoliceScanner from '../components/PoliceScanner';
import { buttonClasses } from '../components/ui/styles';
import { homePathFor } from '../components/layout/nav';
import type { BrandImageName } from '../lib/brand';

const STEPS: { title: string; body: string; image: BrandImageName }[] = [
  {
    title: 'Report in under two minutes',
    body: 'Answer a short voice interview, fill in a guided form, or send a one-tap alert — with photos and a pin on the map.',
    image: 'illoReport',
  },
  {
    title: 'Officers see it instantly',
    body: 'Downtown public-safety officers triage every report on a live operations map, with spoken alerts for urgent ones.',
    image: 'illoMonitor',
  },
  {
    title: 'The block stays in the loop',
    body: 'Nearby member businesses get a heads-up, and you follow your report from received to resolved.',
    image: 'illoCommunity',
  },
];

const FEATURES = [
  { icon: Mic, title: 'Two-way voice interview', body: 'An automated interviewer listens and asks follow-up questions like a dispatcher — then files a structured report.' },
  { icon: AudioLines, title: 'Spoken alerts & briefings', body: 'New reports, shift briefings and read-backs are read aloud in a clear, natural voice.' },
  { icon: MapIcon, title: 'Live operations map', body: 'Every report pinned, prioritized and tracked from new to resolved — on desktop or a phone in the field.' },
  { icon: ScanEye, title: 'Lookout board', body: 'Repeat offenders and suspect vehicles shared with member businesses, with one-tap sighting reports.' },
  { icon: Scale, title: 'Fair by design', body: 'Reports focus on behavior, clothing and vehicles — the interviewer never accepts appearance alone.' },
  { icon: Lock, title: 'Private by default', body: 'Photos stay with the reporter and officers, and row-level security protects every record.' },
];

const DEMO_ROLES: { role: Role; title: string; body: string; icon: typeof Building2 }[] = [
  { role: 'business', title: 'Business owner', body: 'Report incidents, follow your reports, see nearby alerts.', icon: Building2 },
  { role: 'officer', title: 'Public-safety officer', body: 'Triage the live queue, respond, publish BOLOs, hear alerts.', icon: ShieldCheck },
  { role: 'admin', title: 'Administrator', body: 'Everything officers see, plus team and system settings.', icon: UserCog },
];

export default function Landing() {
  const { isDemo, signedIn, role, setDemoRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { incidents } = useIncidents();
  const now = useNow();
  const navigate = useNavigate();

  const enterDemo = (r: Role, to?: string) => {
    setDemoRole(r);
    navigate(to ?? homePathFor(r));
  };

  const reportHref = signedIn ? '/report' : isDemo ? '' : '/login';
  const week = incidents.filter((i) => now - i.createdAt < 7 * 86_400_000);

  return (
    <div className="min-h-dvh bg-bg">
      {/* Hero */}
      <header className="relative isolate overflow-hidden bg-brand-night text-white">
        <BrandImage
          name="skyline"
          width={1920}
          priority
          alt=""
          sizes="100vw"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_60%]"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-navy-950/80 via-navy-900/55 to-navy-950/95" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-navy-950/85 via-navy-950/40 to-transparent" />

        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5 sm:hidden">
            <LogoMark />
            <span className="truncate text-[15px] font-bold tracking-tight text-white">Downtown Safety</span>
          </span>
          <span className="hidden sm:block">
            <Logo inverse />
          </span>
          <div className="flex items-center gap-2">
            <a href="#how" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:text-white md:block">
              How it works
            </a>
            <a href="#features" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-white/80 hover:text-white md:block">
              Features
            </a>
            <button
              onClick={toggleTheme}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            {signedIn && role ? (
              <Link to={homePathFor(role)} className={buttonClasses({ variant: 'gold', size: 'md' })}>
                Open dashboard
              </Link>
            ) : isDemo ? (
              <a href="#demo" className={buttonClasses({ variant: 'gold', size: 'md' })}>
                Try the demo
              </a>
            ) : (
              <Link to="/login" className={buttonClasses({ variant: 'gold', size: 'md' })}>
                Sign in
              </Link>
            )}
          </div>
        </nav>

        <div className="mx-auto max-w-6xl px-4 pb-20 pt-12 sm:px-6 sm:pb-28 sm:pt-20">
          <div className="max-w-2xl animate-slide-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> A self-regulated safety dashboard
            </p>
            <h1 className="text-balance text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Downtown Memphis, watching out for each other.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-navy-100 sm:text-lg">
              See a suspicious person or a crime? Report it straight to the Downtown public-safety officers who monitor this
              dashboard — by a short voice interview, a two-minute form, or a single tap.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {reportHref ? (
                <Link to={reportHref} state={{ from: '/report' }} className={buttonClasses({ variant: 'gold', size: 'xl' })}>
                  <Mic className="h-5 w-5" /> Report an incident
                </Link>
              ) : (
                <button onClick={() => enterDemo('business', '/report')} className={buttonClasses({ variant: 'gold', size: 'xl' })}>
                  <Mic className="h-5 w-5" /> Report an incident
                </button>
              )}
              {isDemo ? (
                <button
                  onClick={() => enterDemo('officer')}
                  className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/25 px-6 text-base font-semibold text-white hover:bg-white/10"
                >
                  <ShieldCheck className="h-5 w-5" /> Officer view
                </button>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex h-14 items-center gap-2 rounded-2xl border border-white/25 px-6 text-base font-semibold text-white hover:bg-white/10"
                >
                  <ShieldCheck className="h-5 w-5" /> Officer sign in
                </Link>
              )}
            </div>
            <a href="tel:911" className="mt-6 inline-flex items-center gap-2 text-[13px] font-semibold text-white/85 hover:text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600">
                <Phone className="h-3.5 w-3.5" />
              </span>
              Someone in danger? Call 911 first — this is not an emergency line.
            </a>
          </div>
        </div>
      </header>

      {/* Live strip */}
      {incidents.length > 0 && (
        <div className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 sm:grid-cols-4 sm:px-6">
            {[
              { label: 'Reports this week', value: week.length },
              { label: 'Open right now', value: incidents.filter((i) => isOpen(i.status)).length },
              { label: 'Resolved this week', value: week.filter((i) => i.status === 'resolved').length },
              { label: 'Voice interviews', value: week.filter((i) => i.kind === 'voice').length },
            ].map((s) => (
              <div key={s.label} className="py-5 text-center sm:text-left">
                <p className="text-2xl font-bold tracking-tight text-ink tabular">{s.value}</p>
                <p className="text-[12px] font-medium text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 max-w-2xl text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">From “that doesn’t look right” to an officer on it.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {STEPS.map((s, idx) => (
            <div key={s.title} className="card overflow-hidden p-0">
              <div className="flex h-48 items-center justify-center bg-surface-2">
                <BrandImage
                  name={s.image}
                  width={280}
                  alt=""
                  className="h-44 w-44 object-contain"
                  fallback={<span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-2xl font-bold text-accent-strong">{idx + 1}</span>}
                />
              </div>
              <div className="p-6">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-accent-strong">Step {idx + 1}</p>
                <h3 className="mt-1 text-lg font-bold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <p className="eyebrow">Built for downtown</p>
              <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl">Everything officers and businesses need — in one place.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Businesses report what they see. Officers triage it live, respond, and keep the block informed. Voice makes it fast for
                both — when your hands are full or you’re on patrol.
              </p>
              <div className="relative mt-8 hidden overflow-hidden rounded-3xl border border-line lg:block">
                <BrandImage name="mainStreet" width={640} alt="Main Street at night with the trolley" className="h-72 w-full object-cover" fallback={<div className="h-72 bg-brand-night" />} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="rounded-2xl border border-line bg-bg p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-ink">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-[15px] font-bold text-ink">{f.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{f.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Demo / CTA */}
      <section id="demo" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        {isDemo ? (
          <>
            <p className="eyebrow">Explore the demo</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink">Pick a seat.</h2>
            <p className="mt-2 max-w-xl text-[15px] text-muted">This deployment runs on sample data — nothing reaches real officers. Switch roles any time from the bar at the top.</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {DEMO_ROLES.map((d) => {
                const Icon = d.icon;
                return (
                  <button key={d.role} onClick={() => enterDemo(d.role)} className="group card p-6 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-ink">{d.title}</h3>
                    <p className="mt-1 text-[13px] text-muted">{d.body}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                      Enter <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="relative overflow-hidden rounded-3xl bg-brand-night p-8 text-white sm:p-12">
            <BrandImage name="panorama" width={1280} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" />
            <div className="relative max-w-xl">
              <h2 className="text-3xl font-bold tracking-tight">Downtown business? Join the network.</h2>
              <p className="mt-3 text-navy-100">Create your account with just your email — no passwords — and set up your storefront in a minute.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/login" className={buttonClasses({ variant: 'gold', size: 'lg' })}>
                  <Building2 className="h-5 w-5" /> Register your business
                </Link>
                <Link to="/login" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-5 font-semibold text-white hover:bg-white/10">
                  <Eye className="h-5 w-5" /> Officer sign in
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Scanner */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid grid-cols-1 gap-6 rounded-3xl border border-line bg-surface p-6 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <h2 className="text-xl font-bold text-ink">Listen live</h2>
            <p className="mt-1 text-sm text-muted">The Memphis Police &amp; Shelby County Sheriff scanner, streamed in the dashboard.</p>
          </div>
          <PoliceScanner variant="bar" className="rounded-2xl border border-line bg-bg p-3.5" />
        </div>
      </section>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              A community safety tool for the core of Downtown Memphis. It is not 911 and does not dispatch emergency services.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-[13px]">
            <div>
              <p className="mb-2 font-semibold text-ink">Emergency</p>
              <ul className="space-y-1.5 text-muted">
                <li>
                  <a href="tel:911" className="hover:text-ink">911 — police, fire, EMS</a>
                </li>
                <li>
                  <a href="tel:+19015452677" className="hover:text-ink">MPD non-emergency · (901) 545-2677</a>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-2 font-semibold text-ink">Dashboard</p>
              <ul className="space-y-1.5 text-muted">
                <li>
                  <Link to={isDemo ? '/welcome#demo' : '/login'} className="hover:text-ink">
                    {isDemo ? 'Try the demo' : 'Sign in'}
                  </Link>
                </li>
                <li>
                  <a href="#how" className="hover:text-ink">How it works</a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <p className={cn('border-t border-line py-4 text-center text-[12px] text-subtle')}>Core Downtown Memphis Safety Dashboard · Memphis, TN</p>
      </footer>
    </div>
  );
}
