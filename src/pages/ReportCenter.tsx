import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Keyboard, Mic, Store, Zap } from 'lucide-react';
import type { Incident } from '../types';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import type { CapturedReport } from '../lib/live';
import { cn } from '../lib/format';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import BrandImage from '../components/brand/BrandImage';
import { Banner } from '../components/ui/Feedback';
import { ButtonLink } from '../components/ui/Button';
import EmergencyCallout from '../components/report/EmergencyCallout';
import VoiceInterview from '../components/report/VoiceInterview';
import ReportForm from '../components/report/ReportForm';
import ReviewSubmit from '../components/report/ReviewSubmit';
import QuickAlert from '../components/report/QuickAlert';
import ReportConfirmation from '../components/report/ReportConfirmation';
import { emptyDraft, mergeCapture, type ReportDraft } from '../components/report/draft';
import type { BrandImageName } from '../lib/brand';

type Mode = 'voice' | 'form' | 'quick';
type Step = 'choose' | Mode | 'review' | 'done';

const DRAFT_KEY = 'dt-report-draft-v1';

function loadDraft(): ReportDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return { ...emptyDraft(), ...(JSON.parse(raw) as Partial<ReportDraft>), photos: [] };
  } catch {
    return null;
  }
}

const METHODS: {
  mode: Mode;
  title: string;
  body: string;
  cta: string;
  icon: typeof Mic;
  image: BrandImageName;
  badge?: string;
}[] = [
  {
    mode: 'voice',
    title: 'Report by voice',
    body: 'A two-way automated voice interview. It asks the right questions and fills in the report while you talk — hands-free.',
    cta: 'Start talking',
    icon: Mic,
    image: 'illoVoice',
    badge: 'Fastest',
  },
  {
    mode: 'form',
    title: 'Guided form',
    body: 'Five short steps — what, where, when, who, details. Can read each question aloud, and you can dictate instead of typing.',
    cta: 'Fill it in',
    icon: Keyboard,
    image: 'illoReport',
  },
  {
    mode: 'quick',
    title: 'Quick alert',
    body: 'One tap for something happening right now at your door. Officers and nearby businesses are alerted immediately.',
    cta: 'Send an alert',
    icon: Zap,
    image: 'illoCommunity',
  },
];

export default function ReportCenter() {
  const [params, setParams] = useSearchParams();
  const { role } = useAuth();
  const { profile } = useProfile();
  const initialMode = params.get('mode');
  const [step, setStep] = useState<Step>(() =>
    initialMode === 'voice' || initialMode === 'form' || initialMode === 'quick' ? initialMode : 'choose',
  );
  const [draft, setDraftState] = useState<ReportDraft>(() => loadDraft() ?? emptyDraft());
  const [filed, setFiled] = useState<Incident | null>(null);

  const setDraft = useCallback((fn: (d: ReportDraft) => ReportDraft) => setDraftState(fn), []);

  // Keep an in-progress draft across reloads (photos excluded).
  useEffect(() => {
    try {
      if (step === 'done' || step === 'choose') sessionStorage.removeItem(DRAFT_KEY);
      else {
        const { photos: _photos, ...rest } = draft;
        void _photos;
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
      }
    } catch {
      /* ignore */
    }
  }, [draft, step]);

  const go = (next: Step) => {
    setStep(next);
    if (next === 'voice' || next === 'form' || next === 'quick') {
      setDraft((d) => ({ ...d, method: next === 'voice' ? 'voice' : next === 'quick' ? 'quick' : d.method === 'voice' ? 'voice' : 'form' }));
      setParams({ mode: next }, { replace: true });
    } else if (next === 'choose') {
      setParams({}, { replace: true });
    }
    document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onCapture = useCallback((c: CapturedReport) => setDraft((d) => mergeCapture({ ...d, method: 'voice' }, c, profile)), [profile, setDraft]);
  const onTranscript = useCallback((text: string) => setDraft((d) => (d.transcript === text ? d : { ...d, transcript: text })), [setDraft]);

  const onSubmitted = (inc: Incident) => {
    setFiled(inc);
    setDraftState(emptyDraft());
    go('done');
  };

  const startOver = () => {
    setDraftState(emptyDraft());
    setFiled(null);
    go('choose');
  };

  const needsStorefront = role === 'business' && !profile;
  const title =
    step === 'voice'
      ? 'Voice interview'
      : step === 'form'
        ? 'Guided report'
        : step === 'quick'
          ? 'Quick alert'
          : step === 'review'
            ? 'Review & send'
            : step === 'done'
              ? 'Thank you'
              : 'Report an incident';

  return (
    <PageContainer>
      {step !== 'done' && (
        <PageHeader
          eyebrow={step === 'choose' ? 'Downtown safety network' : 'New report'}
          title={title}
          description={
            step === 'choose'
              ? 'Suspicious person, a crime, something that doesn’t feel right — it goes straight to the Downtown public-safety officers watching the dashboard.'
              : undefined
          }
          actions={
            step !== 'choose' ? (
              <button
                type="button"
                onClick={() => go(step === 'review' ? (draft.method === 'voice' ? 'voice' : 'form') : 'choose')}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" /> {step === 'review' ? 'Back' : 'Change method'}
              </button>
            ) : undefined
          }
        />
      )}

      {step === 'choose' && (
        <div className="space-y-6">
          <EmergencyCallout />
          {needsStorefront && (
            <Banner
              tone="info"
              title="Set up your storefront for faster reports"
              icon={<Store className="h-4.5 w-4.5" />}
              action={
                <ButtonLink to="/account" size="sm" variant="secondary">
                  Set up
                </ButtonLink>
              }
            >
              With your business location saved, reports can be pinned to your door in one tap.
            </Banner>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => go(m.mode)}
                  className={cn(
                    'group card relative flex flex-col overflow-hidden p-0 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop',
                    m.mode === 'voice' && 'ring-1 ring-[var(--accent)]',
                  )}
                >
                  <div className={cn('relative flex h-40 items-center justify-center overflow-hidden', m.mode === 'voice' ? 'bg-brand-night' : 'bg-surface-2')}>
                    <BrandImage
                      name={m.image}
                      width={240}
                      alt=""
                      className="h-36 w-36 object-contain transition-transform duration-500 group-hover:scale-105"
                      fallback={
                        <span className={cn('flex h-16 w-16 items-center justify-center rounded-2xl', m.mode === 'voice' ? 'bg-gold-400 text-navy-900' : 'bg-accent-soft text-accent-strong')}>
                          <Icon className="h-8 w-8" />
                        </span>
                      }
                    />
                    {m.badge && (
                      <span className="absolute left-3 top-3 rounded-full bg-gold-400 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-navy-900">{m.badge}</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="flex items-center gap-2 text-[16px] font-bold text-ink">
                      <Icon className="h-4.5 w-4.5 text-accent-strong" /> {m.title}
                    </p>
                    <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">{m.body}</p>
                    <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                      {m.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-center text-[12px] text-subtle">
            Reports are seen by Downtown public-safety officers{role === 'business' ? ' and, unless you opt out, summarized for nearby member businesses' : ''}. Describe behavior and clothing — never someone’s race alone.
          </p>
        </div>
      )}

      {step === 'voice' && (
        <VoiceInterview draft={draft} onCapture={onCapture} onTranscript={onTranscript} onReview={() => go('review')} onUseForm={() => go('form')} />
      )}

      {step === 'form' && <ReportForm draft={draft} setDraft={setDraft} profile={profile} onReview={() => go('review')} />}

      {step === 'quick' && <QuickAlert profile={profile} onSubmitted={onSubmitted} />}

      {step === 'review' && (
        <ReviewSubmit
          draft={draft}
          setDraft={setDraft}
          profile={profile}
          onBack={() => go(draft.method === 'voice' ? 'voice' : 'form')}
          onSubmitted={onSubmitted}
        />
      )}

      {step === 'done' && filed && <ReportConfirmation incident={filed} onAnother={startOver} />}
    </PageContainer>
  );
}
