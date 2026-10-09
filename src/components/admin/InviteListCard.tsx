import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Ban, ChevronDown, Clock, History, ListChecks, ListPlus, Pause, Play, RefreshCw, Send, TriangleAlert, X } from 'lucide-react';
import { MAX_LIST_ENTRIES, parseEmailList } from '../../../api/_lib/emailList';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { cn, plural, timeAgo } from '../../lib/format';
import EmailText from '../account/EmailText';
import { messageOf } from '../account/util';
import { ROLE_LABEL } from '../layout/nav';
import { Button, IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Banner } from '../ui/Feedback';
import { Field, Input, Textarea } from '../ui/Form';
import { Dialog } from '../ui/Overlay';
import ListSkeleton from './ListSkeleton';
import {
  clockAt,
  COUNT_TONE,
  COUNTED,
  looksStalled,
  nextRun,
  schedule,
  STATUS_LABEL,
  STATUS_TONE,
  type AddResult,
  type QueueItem,
  type QueueState,
} from './inviteQueue';
import { useInviteQueue } from './useInviteQueue';

interface InviteListCardProps {
  isDemo: boolean;
  /** Invitations went out since the last look — reload the team (new accounts, open invitations). */
  onSent?: () => void;
}

const RECENT_SHOWN = 6;

/** The label every item shares, if they all have the same one: shown once, above the list. */
function sharedLabel(items: QueueItem[]): string | null {
  const first = items[0]?.label ?? null;
  return first && items.every((i) => i.label === first) ? first : null;
}

function ListHeading({ title, label }: { title: string; label: string | null }) {
  return (
    <h4 className="flex flex-wrap items-baseline gap-x-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">
      {title}
      {label && <span className="font-normal normal-case tracking-normal text-subtle">· {label}</span>}
    </h4>
  );
}

function QueueRow({
  item,
  now,
  hideLabel,
  onCancel,
  cancelling,
}: {
  item: QueueItem;
  now: number;
  hideLabel?: boolean;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const meta = [item.role !== 'business' && ROLE_LABEL[item.role], item.name, !hideLabel && item.label].filter(Boolean).join(' · ');
  const outcome = item.status !== 'queued' && item.outcome && item.outcome !== 'Invitation sent' ? item.outcome : null;
  const when = item.status === 'queued' ? null : (item.sentAt ?? item.claimedAt);
  return (
    <li className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-ink wrap-anywhere">
          <EmailText email={item.email} />
        </p>
        {meta && <p className="text-[12px] text-muted wrap-anywhere">{meta}</p>}
        {outcome && (
          <p className={cn('mt-0.5 text-[12px] leading-snug', item.status === 'failed' ? 'text-red-700 dark:text-red-300' : 'text-muted')}>{outcome}</p>
        )}
      </div>
      <div className="flex flex-shrink-0 flex-col items-end gap-1 pt-0.5">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[item.status])}>{STATUS_LABEL[item.status]}</span>
        {when !== null && (
          <time className="text-[11px] text-subtle" dateTime={new Date(when).toISOString()} title={new Date(when).toLocaleString()}>
            {timeAgo(when, now)}
          </time>
        )}
      </div>
      {onCancel && (
        <IconButton size="sm" label={`Cancel the invitation for ${item.email}`} onClick={onCancel} disabled={cancelling} className="-mr-1.5 -mt-1">
          <X className="h-4 w-4" />
        </IconButton>
      )}
    </li>
  );
}

/** "4 sent · 1 skipped" — what the last run did (nothing to report: "nothing to send"). */
function lastRunSummary(r: QueueState['lastRun']): string {
  const parts = [
    r?.sent ? `${r.sent} sent` : null,
    r?.skipped ? `${r.skipped} skipped` : null,
    r?.failed ? `${r.failed} failed` : null,
    r?.cancelled ? `${r.cancelled} cancelled` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'nothing to send';
}

/**
 * Admin › Team: invite a whole list of member businesses — say, a safety meeting's sign-in sheet.
 * Invitations go out a few at a time (5 every 15 minutes) from the administrator who queued them, so
 * emails trickle out and the team can watch, pause, or cancel the rest. Each one is the same invitation
 * Invite someone sends. People already invited aren't invited again unless "Invite again" is ticked.
 */
export default function InviteListCard({ isDemo, onSent }: InviteListCardProps) {
  const q = useInviteQueue(isDemo);
  const now = useNow();
  const { push } = useToast();
  const reinviteId = useId();
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const [reinvite, setReinvite] = useState(false);
  const [error, setError] = useState('');
  /** The dry run the confirm step shows (null: closed). */
  const [review, setReview] = useState<AddResult | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const parsed = useMemo(() => parseEmailList(text), [text]);
  const count = parsed.entries.length;
  const s = q.state;
  const waiting = s?.counts.queued ?? 0;
  const perRun = s?.perRun ?? 5;
  const batch = Math.min(perRun, waiting);
  // Never a time in the past, even if the last load is a while old.
  const nextAt = s ? Math.max(s.nextRunAt, nextRun(now, s.everyMinutes)) : nextRun(now);

  // As invitations go out, the team changes (new accounts, open invitations): let the page reload it.
  const lastSent = useRef<number | null>(null);
  useEffect(() => {
    if (!s) return;
    if (lastSent.current !== null && s.counts.sent > lastSent.current) onSent?.();
    lastSent.current = s.counts.sent;
  }, [s, onSent]);

  const input = () => ({ text, label: label.trim(), reinvite });

  const openReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!count) {
      setError(text.trim() ? 'No email addresses found — put one on each line, like name@business.com.' : 'Paste at least one email address.');
      return;
    }
    if (count > MAX_LIST_ENTRIES) {
      setError(`That’s ${count} addresses — paste up to ${MAX_LIST_ENTRIES} at a time.`);
      return;
    }
    setError('');
    setBusy('preview');
    try {
      setReview(await q.preview(input()));
    } catch (err) {
      push({ title: 'Couldn’t check the list', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const queueList = async () => {
    setBusy('add');
    const pace = review?.queue;
    const when = schedule(
      pace ? { counts: { ...(s?.counts ?? emptyCounts), queued: pace.queued }, perRun: pace.perRun, everyMinutes: pace.everyMinutes, nextRunAt: new Date(pace.nextRunAt).getTime() } : planFrom(s, now),
      review?.added ?? count,
      Date.now(),
    );
    const paused = pace?.paused ?? s?.paused ?? false;
    try {
      const r = await q.add(input());
      const notes = [
        r.alreadyInvited ? `${plural(r.alreadyInvited, 'address', 'addresses')} already invited — not invited again.` : '',
        r.skipped ? `${plural(r.skipped, 'address', 'addresses')} already waiting.` : '',
        isDemo ? 'Demo mode: nothing is sent.' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (r.added) {
        push({
          title: `${plural(r.added, 'invitation')} queued`,
          body: `${
            paused
              ? `The queue is paused — ${r.added === 1 ? 'it goes' : 'they go'} out once you resume.`
              : `${r.added === 1 ? 'It goes' : 'The first go'} out about ${clockAt(when.first, Date.now())}.`
          } ${notes}`.trim(),
          tone: 'success',
        });
      } else {
        push({ title: 'Nothing new to queue', body: notes || 'No email addresses found.', tone: 'info' });
      }
      setText('');
      setLabel('');
      setReinvite(false);
      setReview(null);
    } catch (err) {
      push({ title: 'Couldn’t queue the list', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const togglePause = async (paused: boolean) => {
    setBusy('pause');
    try {
      await q.setPaused(paused);
      push({
        title: paused ? 'Queue paused' : 'Queue resumed',
        body: paused
          ? 'Nothing more goes out until you resume — an email already on its way finishes.'
          : waiting
            ? `${batch === 1 ? 'The next one goes' : `The next ${batch} go`} out about ${clockAt(nextRun(Date.now(), s?.everyMinutes ?? 15), now)}.`
            : 'Lists you queue go out at the next run.',
        tone: 'success',
      });
    } catch (err) {
      push({ title: 'Couldn’t change the queue', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const cancelRest = async () => {
    setBusy('cancel');
    try {
      const n = await q.cancel({ all: true });
      push({ title: n ? `${plural(n, 'invitation')} cancelled` : 'Nothing left to cancel', body: 'Invitations that already went out stay sent.', tone: 'success' });
      setConfirmCancel(false);
    } catch (err) {
      push({ title: 'Couldn’t cancel', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const cancelOne = async (item: QueueItem) => {
    setBusy(item.id);
    try {
      await q.cancel({ id: item.id });
      push({ title: 'Invitation cancelled', body: `${item.email} won’t be invited from this list.`, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t cancel it', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const summary = [
    count && plural(count, 'address', 'addresses'),
    parsed.duplicates && `${plural(parsed.duplicates, 'repeat')} left out`,
    parsed.invalid.length && `${plural(parsed.invalid.length, 'line')} ${parsed.invalid.length === 1 ? 'isn’t an address' : 'aren’t addresses'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const total = s ? Object.values(s.counts).reduce((a, b) => a + b, 0) : 0;
  const recent = s ? (showAll ? s.recent : s.recent.slice(0, RECENT_SHOWN)) : [];
  const stalled = s ? looksStalled(s, now) : false;

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          icon={<ListPlus className="h-[18px] w-[18px]" />}
          title="Invite a list"
          subtitle="Paste member businesses from a meeting or sign-in sheet. Invitations go out a few at a time, so you can watch and pause."
          action={
            !isDemo && (
              <IconButton label="Refresh the queue" size="sm" onClick={q.refresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            )
          }
        />
        <form onSubmit={(e) => void openReview(e)} noValidate className="space-y-4">
          <Field label="Email addresses" error={error || undefined} hint={summary || 'One per line. “Name <email>” works too; repeats are left out.'}>
            {(id) => (
              <Textarea
                id={id}
                rows={6}
                value={text}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                placeholder={'name@business.com\nDana Whitfield <dana@business.com>\n"Ortega, Luis" <luis@business.com>'}
                className="font-mono text-[13px]"
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError('');
                }}
                aria-invalid={error ? true : undefined}
              />
            )}
          </Field>
          {parsed.invalid.length > 0 && (
            <ul className="-mt-2 space-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-[12px] text-muted">
              {parsed.invalid.slice(0, 3).map((l) => (
                <li key={`${l.line}-${l.text}`} className="wrap-anywhere">
                  <span className="font-semibold text-ink-2">Line {l.line}:</span> {l.text}
                </li>
              ))}
              {parsed.invalid.length > 3 && <li>…and {plural(parsed.invalid.length - 3, 'more line')}</li>}
            </ul>
          )}
          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <span className="font-semibold text-ink-2">Everyone on the list is invited as a member business.</span> Invite Public Safety
            officers and administrators one at a time with Invite someone.
          </p>
          <Field label="Label" optional hint="Where the list came from — only administrators see it.">
            {(id) => <Input id={id} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Safety Meeting · Mar 11" />}
          </Field>
          <div className="flex items-start gap-3">
            <input
              id={reinviteId}
              type="checkbox"
              checked={reinvite}
              onChange={(e) => setReinvite(e.target.checked)}
              className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-primary"
            />
            <label htmlFor={reinviteId} className="min-w-0 cursor-pointer">
              <span className="block text-[13px] font-medium text-ink">Invite again people who were already invited</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-muted">
                {reinvite
                  ? 'They get another invitation email. People who already use the dashboard are still skipped.'
                  : 'Off: anyone already invited — by a list, Invite someone, an access code or an approved request — is left out.'}
              </span>
            </label>
          </div>
          <Button type="submit" block loading={busy === 'preview'} icon={<ListChecks className="h-4 w-4" />}>
            {count ? `Review ${plural(count, 'address', 'addresses')}` : 'Review the list'}
          </Button>
          <p className="text-[12px] leading-relaxed text-subtle">
            {isDemo
              ? 'Demo mode: the queue is simulated and no email is sent.'
              : 'Each one is the invitation Invite someone sends, from you. People who already use the dashboard are skipped.'}
          </p>
        </form>
      </div>

      <div className="border-t border-line px-5 py-5 sm:px-6">
        {!s && !q.error ? (
          <div className="-mx-5 -mb-5 sm:-mx-6">
            <ListSkeleton rows={2} />
          </div>
        ) : !s ? (
          <Banner tone="warning" title="Couldn’t load the queue">
            {q.error}
          </Banner>
        ) : total === 0 && !s.paused ? (
          <p className="text-[13px] leading-relaxed text-muted">Nothing queued yet. Lists you queue show up here with each result.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink" aria-live="polite">
                {s.paused ? (
                  <>
                    <Pause className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                    {s.pauseReason ? `Paused: ${s.pauseReason}` : 'Paused'}
                  </>
                ) : waiting ? (
                  <>
                    <Clock className="h-4 w-4 flex-shrink-0 text-accent-strong" aria-hidden />
                    Next {batch} at {clockAt(nextAt, now)}
                  </>
                ) : (
                  'Nothing waiting'
                )}
                {s.counts.sending > 0 && <span className="font-normal text-muted">· {s.counts.sending} sending now</span>}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={s.paused ? 'primary' : 'secondary'}
                  icon={s.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  loading={busy === 'pause'}
                  onClick={() => void togglePause(!s.paused)}
                >
                  {s.paused ? 'Resume' : 'Pause'}
                </Button>
                {waiting > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Ban className="h-4 w-4" />}
                    onClick={() => setConfirmCancel(true)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    Cancel the rest
                  </Button>
                )}
              </div>
            </div>
            {s.paused && (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                {waiting ? `${plural(waiting, 'invitation')} waiting. ` : ''}Nothing goes out until you resume, apart from an email already
                on its way.
                {s.pauseReason ? ' Resume once the limit resets — tomorrow for a daily limit.' : ''}
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
              <History className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              {s.lastRunAt ? `Last run ${clockAt(s.lastRunAt, now)} · ${lastRunSummary(s.lastRun)}` : 'No run yet'}
            </p>
            {stalled && (
              <Banner tone="warning" icon={<TriangleAlert className="h-4 w-4" />} title="Nothing has gone out for over 20 minutes" className="mt-3">
                Invitations are waiting, but no run has happened. The scheduled sender may be off — check the cron job and CRON_SECRET in
                Vercel.
              </Banner>
            )}

            <dl className="mt-4 grid grid-cols-5 gap-1.5">
              {COUNTED.map((status) => (
                <div key={status} className="flex flex-col-reverse items-center rounded-xl bg-surface-2 px-1 py-2.5 text-center">
                  <dt className="mt-1 text-[11px] font-medium leading-none text-muted">{STATUS_LABEL[status]}</dt>
                  <dd className={cn('text-[17px] font-bold leading-none tabular', s.counts[status] > 0 ? COUNT_TONE[status] : 'text-subtle')}>
                    {s.counts[status]}
                  </dd>
                </div>
              ))}
            </dl>

            {s.next.length > 0 && (
              <section className="mt-5">
                <ListHeading title="Up next" label={sharedLabel(s.next)} />
                <ul className="mt-1 divide-y divide-line">
                  {s.next.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      now={now}
                      hideLabel={Boolean(sharedLabel(s.next))}
                      onCancel={() => void cancelOne(item)}
                      cancelling={busy === item.id}
                    />
                  ))}
                </ul>
              </section>
            )}

            {s.recent.length > 0 && (
              <section className="mt-5">
                <ListHeading title="Recent results" label={sharedLabel(recent)} />
                <ul className="mt-1 divide-y divide-line">
                  {recent.map((item) => (
                    <QueueRow key={item.id} item={item} now={now} hideLabel={Boolean(sharedLabel(recent))} />
                  ))}
                </ul>
                {s.recent.length > RECENT_SHOWN && (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-accent-strong hover:underline"
                    aria-expanded={showAll}
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition', showAll && 'rotate-180')} />
                    {showAll ? 'Show fewer' : `Show ${s.recent.length - RECENT_SHOWN} more`}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <Dialog
        open={review !== null}
        onClose={() => busy !== 'add' && setReview(null)}
        icon={<ListChecks className="h-5 w-5" />}
        title={review?.added ? `Queue ${plural(review.added, 'invitation')}?` : 'Nothing new to invite'}
        description={`As member businesses${label.trim() ? ` · ${label.trim()}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)} disabled={busy === 'add'}>
              Back
            </Button>
            <Button loading={busy === 'add'} disabled={!review?.added} icon={<Send className="h-4 w-4" />} onClick={() => void queueList()}>
              {review?.added ? `Queue ${plural(review.added, 'invitation')}` : 'Queue'}
            </Button>
          </>
        }
      >
        {review && <ReviewText review={review} fallback={planFrom(s, now)} now={now} />}
      </Dialog>

      <Dialog
        open={confirmCancel}
        onClose={() => busy !== 'cancel' && setConfirmCancel(false)}
        size="sm"
        icon={<Ban className="h-5 w-5" />}
        title="Cancel the rest?"
        description={`${plural(waiting, 'invitation')} still waiting.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmCancel(false)} disabled={busy === 'cancel'}>
              Keep them
            </Button>
            <Button variant="danger" loading={busy === 'cancel'} onClick={() => void cancelRest()}>
              Cancel the rest
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-2">
          They won’t be sent. If a run is emailing one right now, that one still goes out. Invitations that already went out stay sent.
        </p>
      </Dialog>
    </Card>
  );
}

const emptyCounts = { queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0 };

/** The queue's pace for the confirm step when there's no fresher dry run. */
function planFrom(s: QueueState | null, now: number) {
  return s
    ? { counts: s.counts, perRun: s.perRun, everyMinutes: s.everyMinutes, nextRunAt: s.nextRunAt, paused: s.paused }
    : { counts: emptyCounts, perRun: 5, everyMinutes: 15, nextRunAt: nextRun(now), paused: false };
}

/** "92 invitations will go out 5 every 15 minutes, starting about 2:45 PM. You can pause any time." */
function ReviewText({ review, fallback, now }: { review: AddResult; fallback: ReturnType<typeof planFrom>; now: number }) {
  const pace = review.queue
    ? {
        counts: { ...fallback.counts, queued: review.queue.queued },
        perRun: review.queue.perRun,
        everyMinutes: review.queue.everyMinutes,
        nextRunAt: new Date(review.queue.nextRunAt).getTime(),
        paused: review.queue.paused,
      }
    : fallback;
  const count = review.added;
  const when = schedule(pace, count, now);
  const n = <strong className="font-semibold text-ink">{plural(count, 'invitation')}</strong>;
  const start = <strong className="font-semibold text-ink">{clockAt(when.first, now)}</strong>;
  const ahead = pace.counts.queued;
  return (
    <>
      <div className="space-y-2 text-sm leading-relaxed text-ink-2">
        {count === 0 ? (
          <p>Everyone on this list is already invited or already waiting in the queue.</p>
        ) : pace.paused ? (
          <p>
            {n} will go out {pace.perRun} every {pace.everyMinutes} minutes once you resume the queue — it’s paused now.
          </p>
        ) : count > pace.perRun ? (
          <p>
            {n} will go out {pace.perRun} every {pace.everyMinutes} minutes, starting about {start}. You can pause any time.
          </p>
        ) : (
          <p>
            {n} will go out about {start}. You can pause any time.
          </p>
        )}
        {count > 0 && !pace.paused && when.runs > 1 && <p className="text-[13px] text-muted">The last should go out about {clockAt(when.last, now)}.</p>}
        {count > 0 && ahead > 0 && <p className="text-[13px] text-muted">{plural(ahead, 'invitation')} already waiting go first.</p>}
      </div>
      <ul className="mt-4 space-y-1.5 rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
        <li>Everyone gets the invitation for a member business, from you.</li>
        {review.alreadyInvited > 0 && (
          <li>
            <span className="font-semibold text-ink">{plural(review.alreadyInvited, 'address', 'addresses')} already invited</span> — not invited
            again
            {review.alreadyInvitedEmails.length > 0 &&
              `: ${review.alreadyInvitedEmails.slice(0, 5).join(', ')}${review.alreadyInvited > 5 ? ` and ${review.alreadyInvited - 5} more` : ''}`}
            . Tick “Invite again” to send them another.
          </li>
        )}
        {review.reinvited > 0 && <li>{plural(review.reinvited, 'address', 'addresses')} already invited will get another invitation.</li>}
        {review.skipped > 0 && <li>{plural(review.skipped, 'address', 'addresses')} already waiting in the queue — left as they are.</li>}
        <li>People who already use the dashboard are skipped when their turn comes.</li>
        {review.duplicates > 0 && <li>{plural(review.duplicates, 'repeated address', 'repeated addresses')} left out.</li>}
        {review.invalid > 0 && (
          <li>
            {plural(review.invalid, 'line')} {review.invalid === 1 ? 'isn’t an email address' : 'aren’t email addresses'} and{' '}
            {review.invalid === 1 ? 'is' : 'are'} left out
            {review.invalid <= 3 ? `: ${review.invalidLines.map((l) => `line ${l.line}`).join(', ')}` : ''}.
          </li>
        )}
      </ul>
    </>
  );
}
