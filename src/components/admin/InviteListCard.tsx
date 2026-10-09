import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Ban, ChevronDown, Clock, ListChecks, ListPlus, Pause, Play, RefreshCw, Send, TriangleAlert, X } from 'lucide-react';
import { MAX_LIST_ENTRIES, parseEmailList } from '../../../api/_lib/emailList';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { cn, plural, timeAgo } from '../../lib/format';
import type { Role } from '../../types';
import EmailText from '../account/EmailText';
import { messageOf } from '../account/util';
import { ROLE_LABEL } from '../layout/nav';
import { Button, IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Banner } from '../ui/Feedback';
import { Field, Input, Select, Textarea } from '../ui/Form';
import { Dialog } from '../ui/Overlay';
import ListSkeleton from './ListSkeleton';
import { clockAt, COUNT_TONE, COUNTED, nextRun, schedule, STATUS_LABEL, STATUS_TONE, type QueueItem, type QueueState } from './inviteQueue';
import { INVITE_ROLES, ROLE_HINT, roleNoun } from './team';
import { useInviteQueue } from './useInviteQueue';

interface InviteListCardProps {
  isDemo: boolean;
  /** Invitations went out since the last look — e.g. reload Pending invites. */
  onSent?: () => void;
}

const ROLE_WARNING: Partial<Record<Role, string>> = {
  officer:
    'Everyone on this list becomes a Public Safety officer: they see every report, internal notes and reporters’ contact details. Keep officer lists short.',
  admin: 'Everyone on this list becomes an administrator: everything officers see, plus deciding who’s on the network.',
};

const RECENT_SHOWN = 6;

function asRole(value: string): Role {
  return value === 'admin' || value === 'officer' ? value : 'business';
}

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

/**
 * Admin › Team: invite a whole list — say, a safety meeting's sign-in sheet. Invitations go out a few at a
 * time (5 every 15 minutes) from the administrator who queued them, so emails trickle out and the team can
 * watch, pause, or cancel the rest. Each one is the same invitation Invite someone sends.
 */
export default function InviteListCard({ isDemo, onSent }: InviteListCardProps) {
  const q = useInviteQueue(isDemo);
  const now = useNow();
  const { push } = useToast();
  const [text, setText] = useState('');
  // Least access first, like Invite someone.
  const [role, setRole] = useState<Role>('business');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const parsed = useMemo(() => parseEmailList(text), [text]);
  const count = parsed.entries.length;
  const s = q.state;
  const plan = s ?? { counts: { queued: 0, sending: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0 }, perRun: 5, everyMinutes: 15, nextRunAt: nextRun(now), paused: false };
  const waiting = s?.counts.queued ?? 0;
  const batch = Math.min(plan.perRun, waiting);

  // As invitations go out, the Pending invites list grows: let the page reload it.
  const lastSent = useRef<number | null>(null);
  useEffect(() => {
    if (!s) return;
    if (lastSent.current !== null && s.counts.sent > lastSent.current) onSent?.();
    lastSent.current = s.counts.sent;
  }, [s, onSent]);

  const review = (e: FormEvent) => {
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
    setReviewing(true);
  };

  const queueList = async () => {
    setBusy('add');
    const when = schedule(plan, count);
    try {
      const r = await q.add({ text, role, label: label.trim() });
      const already = r.skipped ? ` ${plural(r.skipped, 'address', 'addresses')} ${r.skipped === 1 ? 'was' : 'were'} already waiting.` : '';
      if (r.added) {
        push({
          title: `${plural(r.added, 'invitation')} queued`,
          body:
            (plan.paused
              ? `The queue is paused — ${r.added === 1 ? 'it goes' : 'they go'} out once you resume.`
              : `${r.added === 1 ? 'It goes' : 'The first go'} out about ${clockAt(when.first, now)}.`) +
            already +
            (isDemo ? ' Demo mode: nothing is sent.' : ''),
          tone: 'success',
        });
      } else {
        push({ title: 'Nothing new to queue', body: r.skipped ? 'Every address is already waiting in the queue.' : 'No email addresses found.', tone: 'info' });
      }
      setText('');
      setLabel('');
      setReviewing(false);
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
          ? 'Nothing goes out until you resume.'
          : waiting
            ? `${batch === 1 ? 'The next one goes' : `The next ${batch} go`} out about ${clockAt(nextRun(Date.now(), plan.everyMinutes), now)}.`
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
  const when = schedule(plan, count);
  const total = s ? Object.values(s.counts).reduce((a, b) => a + b, 0) : 0;
  const recent = s ? (showAll ? s.recent : s.recent.slice(0, RECENT_SHOWN)) : [];

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          icon={<ListPlus className="h-[18px] w-[18px]" />}
          title="Invite a list"
          subtitle="Paste addresses from a meeting or sign-in sheet. Invitations go out a few at a time, so you can watch and pause."
          action={
            !isDemo && (
              <IconButton label="Refresh the queue" size="sm" onClick={q.refresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
            )
          }
        />
        <form onSubmit={review} noValidate className="space-y-4">
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
          <Field label="Invite as" hint={ROLE_HINT[role]}>
            {(id) => (
              <Select id={id} value={role} onChange={(e) => setRole(asRole(e.target.value))}>
                {INVITE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {ROLE_WARNING[role] && (
            <Banner tone="warning" icon={<TriangleAlert className="h-4 w-4" />}>
              {ROLE_WARNING[role]}
            </Banner>
          )}
          <Field label="Label" optional hint="Where the list came from — only administrators see it.">
            {(id) => <Input id={id} value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Safety Meeting · Mar 11" />}
          </Field>
          <Button type="submit" block icon={<ListChecks className="h-4 w-4" />}>
            {count ? `Review ${plural(count, 'invitation')}` : 'Review invitations'}
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
        ) : total === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">Nothing queued yet. Lists you queue show up here with each result.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink" aria-live="polite">
                {s.paused ? (
                  <>
                    <Pause className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
                    Paused
                  </>
                ) : waiting ? (
                  <>
                    <Clock className="h-4 w-4 text-accent-strong" aria-hidden />
                    Next {batch} at {clockAt(s.nextRunAt, now)}
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
                {waiting ? `${plural(waiting, 'invitation')} waiting. ` : ''}Nothing goes out until you resume.
              </p>
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
        open={reviewing}
        onClose={() => busy !== 'add' && setReviewing(false)}
        icon={<ListChecks className="h-5 w-5" />}
        title={`Queue ${plural(count, 'invitation')}?`}
        description={`As ${roleNoun(role)}${label.trim() ? ` · ${label.trim()}` : ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewing(false)} disabled={busy === 'add'}>
              Back
            </Button>
            <Button loading={busy === 'add'} icon={<Send className="h-4 w-4" />} onClick={() => void queueList()}>
              Queue {plural(count, 'invitation')}
            </Button>
          </>
        }
      >
        <ReviewText count={count} plan={plan} when={when} now={now} />
        <ul className="mt-4 space-y-1.5 rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
          <li>Everyone gets the invitation for {roleNoun(role)}, from you.</li>
          <li>People who already use the dashboard are skipped, and an invitation never lowers anyone’s role.</li>
          {parsed.duplicates > 0 && <li>{plural(parsed.duplicates, 'repeated address', 'repeated addresses')} left out.</li>}
          {parsed.invalid.length > 0 && (
            <li>
              {plural(parsed.invalid.length, 'line')} {parsed.invalid.length === 1 ? 'isn’t an email address' : 'aren’t email addresses'} and{' '}
              {parsed.invalid.length === 1 ? 'is' : 'are'} left out
              {parsed.invalid.length <= 3 ? `: ${parsed.invalid.map((l) => `line ${l.line}`).join(', ')}` : ''}.
            </li>
          )}
        </ul>
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
          They won’t be sent. Invitations that already went out stay sent — revoke one under Pending invites if you need to.
        </p>
      </Dialog>
    </Card>
  );
}

/** "92 invitations will go out 5 every 15 minutes, starting about 2:45 PM. You can pause any time." */
function ReviewText({
  count,
  plan,
  when,
  now,
}: {
  count: number;
  plan: Pick<QueueState, 'paused' | 'perRun' | 'everyMinutes' | 'counts'>;
  when: { first: number; last: number; runs: number };
  now: number;
}) {
  const n = <strong className="font-semibold text-ink">{plural(count, 'invitation')}</strong>;
  const start = <strong className="font-semibold text-ink">{clockAt(when.first, now)}</strong>;
  const ahead = plan.counts.queued;
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink-2">
      {plan.paused ? (
        <p>
          {n} will go out {plan.perRun} every {plan.everyMinutes} minutes once you resume the queue — it’s paused now.
        </p>
      ) : count > plan.perRun ? (
        <p>
          {n} will go out {plan.perRun} every {plan.everyMinutes} minutes, starting about {start}. You can pause any time.
        </p>
      ) : (
        <p>
          {n} will go out about {start}. You can pause any time.
        </p>
      )}
      {!plan.paused && when.runs > 1 && <p className="text-[13px] text-muted">The last should go out about {clockAt(when.last, now)}.</p>}
      {ahead > 0 && <p className="text-[13px] text-muted">{plural(ahead, 'invitation')} already waiting go first.</p>}
    </div>
  );
}
