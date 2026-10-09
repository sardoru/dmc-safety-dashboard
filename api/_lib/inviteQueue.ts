import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedUser, Role } from './auth.js';
import type { EmailError } from './emails.js';
import { inviteByEmail, type Inviter } from './invite.js';
import { audit, inviterName, normalizeEmail, signedInBefore, standingOf } from './membership.js';

/**
 * Invite a list, paced: the queue an administrator fills in Admin → Team (`/api/admin/invite-queue`) and
 * the cron drains (`/api/cron/invites`, every 15 minutes) — a few addresses per run, 5 by default, each
 * invited exactly like Admin → Team → Invite someone (`api/_lib/invite.ts`). Tables: migrations 0006, 0008.
 *
 * Brakes: a run claims one row at a time and re-reads the pause switch before each; right before an
 * email goes out it re-checks — in one statement — that the row is still being sent and not cancelled,
 * and stamps `emailing_at`. A row stuck after that stamp may have gone out and is never sent again.
 */

/** The cron's schedule in vercel.json: `*\/15 * * * *`. */
export const RUN_EVERY_MINUTES = 15;
export const SLOT_MS = RUN_EVERY_MINUTES * 60_000;
export const DEFAULT_PER_RUN = 5;
/** invite_queue_settings.per_run is checked 1–10, so a run stays well inside the 30 s function limit. */
export const MAX_PER_RUN = 10;
/** A row is claimed at most this many times before it's given up on. */
export const MAX_ATTEMPTS = 3;
/** A row still `sending` this long after it was claimed: its run died. */
export const STUCK_AFTER_MS = 30 * 60_000;
/** Resend takes about 2 requests a second: at least this long between two emails. */
export const SEND_GAP_MS = 600;
/** Start no new send after this long into a run (Vercel stops functions at 30 s). */
export const RUN_BUDGET_MS = 20_000;

export const QUEUE_STATUSES = ['queued', 'sending', 'sent', 'skipped', 'failed', 'cancelled'] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];
export type QueueCounts = Record<QueueStatus, number>;

export interface QueueRow {
  id: string;
  seq: number;
  email: string;
  role: Role;
  name: string | null;
  label: string | null;
  status: QueueStatus;
  outcome: string | null;
  queued_by: string | null;
  created_at: string;
  claimed_at: string | null;
  emailing_at: string | null;
  sent_at: string | null;
  attempts: number;
}

/** What Admin → Team sees of a row. */
export const ROW_FIELDS = 'id, email, name, label, role, status, outcome, created_at, claimed_at, sent_at, attempts';

export interface QueueSettings {
  paused: boolean;
  perRun: number;
  /** Why the queue paused itself (the email limit); null when an administrator paused it. */
  pauseReason: string | null;
  /** When pause / resume last changed. */
  changedAt: string | null;
  lastRunAt: string | null;
  lastRun: Record<string, unknown> | null;
}

/** The queue's tables, columns or claim function aren't there: a migration hasn't been applied. */
export class QueueNotReady extends Error {
  constructor() {
    super('Invite a list isn’t set up yet — apply migrations 0006_invite_queue.sql and 0008_invite_queue_brakes.sql.');
    this.name = 'QueueNotReady';
  }
}

/** A database error as an Error — QueueNotReady when a table, column or function is missing. */
export function dbError(error: { code?: string; message?: string }): Error {
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '')) return new QueueNotReady();
  return new Error(error.message || 'Database error');
}

/** The run after `now`: runs start on the quarter hour (:00, :15, :30, :45). */
export function nextRunAt(now: number): number {
  return (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
}

/** The quarter hour `now` falls in — one run per slot. */
export function slotOf(now: number): number {
  return Math.floor(now / SLOT_MS) * SLOT_MS;
}

export function clampPerRun(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PER_RUN) : DEFAULT_PER_RUN;
}

export async function readSettings(admin: SupabaseClient): Promise<QueueSettings> {
  const { data, error } = await admin
    .from('invite_queue_settings')
    .select('paused, per_run, pause_reason, updated_at, last_run_at, last_run')
    .eq('id', true)
    .maybeSingle();
  if (error) throw dbError(error);
  return {
    paused: Boolean(data?.paused),
    perRun: clampPerRun(data?.per_run ?? DEFAULT_PER_RUN),
    pauseReason: (data?.pause_reason as string | null) ?? null,
    changedAt: (data?.updated_at as string | null) ?? null,
    lastRunAt: (data?.last_run_at as string | null) ?? null,
    lastRun: (data?.last_run as Record<string, unknown> | null) ?? null,
  };
}

export async function countByStatus(admin: SupabaseClient): Promise<QueueCounts> {
  const results = await Promise.all(
    QUEUE_STATUSES.map((status) => admin.from('invite_queue').select('id', { count: 'exact', head: true }).eq('status', status)),
  );
  const counts = {} as QueueCounts;
  QUEUE_STATUSES.forEach((status, i) => {
    const { count, error } = results[i];
    if (error) throw dbError(error);
    counts[status] = count ?? 0;
  });
  return counts;
}

// ── The cron's run ───────────────────────────────────────────────────────────

export const OUTCOME = {
  member: 'Already a member',
  gaveUp: `Gave up after ${MAX_ATTEMPTS} tries — the send never started. Add the address again to retry.`,
  unsure: 'May have gone out — check before inviting again',
  busy: 'Too many at once — trying again next run',
  stillBusy: `Couldn’t send: still too busy after ${MAX_ATTEMPTS} tries. Add the address again to retry.`,
  notBusiness: 'Not sent: lists are for member businesses — invite officers and administrators with Invite someone',
  noAdmin: 'Not sent: whoever queued it is no longer an administrator',
  stopped: 'Cancelled before it was emailed',
} as const;

/**
 * How a claimed row ends. `retry` and `requeue` put it back in the queue (a retry counts as a try; a
 * requeue — paused, or the email limit — doesn't).
 */
type RowEnd = { status: 'sent' | 'skipped' | 'failed' | 'cancelled' | 'retry' | 'requeue'; outcome: string | null };

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Rows whose run died: never started emailing → back in the queue (or given up after MAX_ATTEMPTS
 * claims); started emailing → failed, "may have gone out", and never sent again on a guess.
 */
export async function recoverStuck(admin: SupabaseClient, now: number): Promise<{ requeued: number; gaveUp: number; unsure: number }> {
  const cutoff = iso(now - STUCK_AFTER_MS);
  const stuck = () => admin.from('invite_queue');
  const requeue = await stuck()
    .update({ status: 'queued', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .is('emailing_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .select('id');
  if (requeue.error) throw dbError(requeue.error);
  const giveUp = await stuck()
    .update({ status: 'failed', outcome: OUTCOME.gaveUp })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .is('emailing_at', null)
    .gte('attempts', MAX_ATTEMPTS)
    .select('id');
  if (giveUp.error) throw dbError(giveUp.error);
  const unsure = await stuck()
    .update({ status: 'failed', outcome: OUTCOME.unsure })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .not('emailing_at', 'is', null)
    .select('id');
  if (unsure.error) throw dbError(unsure.error);
  return { requeued: requeue.data?.length ?? 0, gaveUp: giveUp.data?.length ?? 0, unsure: unsure.data?.length ?? 0 };
}

/** The oldest `n` queued rows, now `sending` and this run's alone (claim_queued_invites, FOR UPDATE SKIP LOCKED). */
export async function claimQueued(admin: SupabaseClient, n: number): Promise<QueueRow[]> {
  const { data, error } = await admin.rpc('claim_queued_invites', { n });
  if (error) throw dbError(error);
  return ((data ?? []) as QueueRow[]).sort((a, b) => a.seq - b.seq);
}

/** Claim this quarter hour for one run (check-and-set): false when another run already has it. */
export async function takeSlot(admin: SupabaseClient, now: number): Promise<boolean> {
  const slot = iso(slotOf(now));
  const { data, error } = await admin.from('invite_queue_settings').update({ last_slot: slot }).eq('id', true).lt('last_slot', slot).select('id');
  if (error) throw dbError(error);
  return (data?.length ?? 0) > 0;
}

/**
 * The administrator who queued a row, looked up once per run: the invite comes from them, and the email
 * shows their name. Null when they're gone or no longer an administrator — their rows aren't sent.
 */
function inviterLookup(admin: SupabaseClient) {
  const cache = new Map<string, Promise<Inviter | null>>();
  const load = async (id: string): Promise<Inviter | null> => {
    const { data, error } = await admin.from('profiles').select('id, email, role').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.role !== 'admin') return null;
    const actor: AuthedUser = { id: String(data.id), email: (data.email as string | null) ?? null, role: 'admin' };
    return { actor, name: await inviterName(admin, actor) };
  };
  return (id: string | null): Promise<Inviter | null> => {
    if (!id) return Promise.resolve(null);
    let hit = cache.get(id);
    if (!hit) {
      hit = load(id);
      cache.set(id, hit);
    }
    return hit;
  };
}

const message = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Something went wrong').replace(/\s+/g, ' ').trim();
/** Rate limited (the email service's "Too many requests", a sign-in link's "rate limit exceeded"). */
const busy = (text: string) => /too many requests|rate.?limit/i.test(text);
/** The email service's daily or monthly sending limit — the queue pauses itself. */
function quotaReason(err: unknown): string | null {
  const e = err as EmailError;
  const said = `${e?.code ?? ''} ${e instanceof Error ? e.message : ''}`;
  if (!/quota/i.test(said)) return null;
  return /month/i.test(said) ? 'the monthly email limit was reached' : 'the daily email limit was reached';
}
/** Busy: back in the queue for the next run — until the row has had MAX_ATTEMPTS tries. */
const busyEnd = (row: QueueRow): RowEnd =>
  row.attempts >= MAX_ATTEMPTS ? { status: 'failed', outcome: OUTCOME.stillBusy } : { status: 'retry', outcome: OUTCOME.busy };

/** Stopped right before the email: cancelled (by an administrator) or the queue was paused. */
type Brake = 'cancelled' | 'paused' | null;

/**
 * Right before the email: is the queue still running, and is this row still being sent? Stamps
 * `emailing_at` in the same statement that checks the row, so a cancel either lands first (and nothing
 * is emailed) or finds the email already on its way.
 */
async function startEmailing(admin: SupabaseClient, row: QueueRow, brake: { why: Brake }): Promise<boolean> {
  if ((await readSettings(admin)).paused) {
    brake.why = 'paused';
    return false;
  }
  const { data, error } = await admin
    .from('invite_queue')
    .update({ emailing_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'sending')
    .is('emailing_at', null)
    .select('id');
  if (error) throw dbError(error);
  if (!data?.length) {
    brake.why = 'cancelled';
    return false;
  }
  return true;
}

/** Invite one claimed row the way Invite someone does — unless its address already uses the dashboard. */
async function inviteRow(
  admin: SupabaseClient,
  row: QueueRow,
  inviterOf: ReturnType<typeof inviterLookup>,
  brake: { why: Brake },
): Promise<RowEnd> {
  if (row.role !== 'business') return { status: 'cancelled', outcome: OUTCOME.notBusiness };
  const from = await inviterOf(row.queued_by);
  if (!from) return { status: 'cancelled', outcome: OUTCOME.noAdmin };
  const email = normalizeEmail(row.email);
  if (!email) return { status: 'failed', outcome: 'Not a valid email address' };

  // People who already use the dashboard aren't invited again; an account whose first invite was
  // never opened gets the invitation again, as Invite someone does.
  const { account } = await standingOf(admin, email);
  if (account && (await signedInBefore(admin, account.id))) return { status: 'skipped', outcome: OUTCOME.member };

  const result = await inviteByEmail(admin, email, 'business', from, {
    via: 'queue',
    idempotencyKey: `invite-queue/${row.id}`,
    beforeSend: () => startEmailing(admin, row, brake),
  });
  if (result.kind === 'stopped') {
    return brake.why === 'paused' ? { status: 'requeue', outcome: null } : { status: 'cancelled', outcome: OUTCOME.stopped };
  }
  if (result.kind === 'no-link') {
    return busy(result.error) ? busyEnd(row) : { status: 'failed', outcome: `Couldn’t make a sign-in link: ${result.error}` };
  }
  if (!result.emailed) return { status: 'failed', outcome: 'Couldn’t make a sign-in link — nothing was sent' };
  if (result.status !== 'invited') return { status: 'sent', outcome: 'Sign-in link sent — they already have an account' };
  return { status: 'sent', outcome: account ? 'Invitation sent again — the first was never opened' : 'Invitation sent' };
}

/**
 * Record how a row ended — only while it's still `sending`. False when it isn't (an administrator
 * cancelled it before its email started): it stays cancelled.
 */
async function settle(admin: SupabaseClient, row: QueueRow, end: RowEnd): Promise<boolean> {
  const outcome = end.outcome?.slice(0, 500) ?? null;
  const patch =
    end.status === 'retry'
      ? { status: 'queued', claimed_at: null, emailing_at: null, outcome }
      : end.status === 'requeue'
        ? { status: 'queued', claimed_at: null, emailing_at: null, outcome, attempts: Math.max(0, row.attempts - 1) }
        : { status: end.status, outcome, ...(end.status === 'sent' ? { sent_at: new Date().toISOString() } : {}) };
  let last: { message?: string } | null = null;
  // One retry: a failed write would leave the row `sending` until it counts as stuck.
  for (let i = 0; i < 2; i++) {
    const { data, error } = await admin.from('invite_queue').update(patch).eq('id', row.id).eq('status', 'sending').select('id');
    if (!error) return Boolean(data?.length);
    last = error;
  }
  throw new Error(last?.message || 'Could not record the result');
}

/** The queue pauses itself — the email limit — and says why (Admin → Team, Activity). */
async function pauseItself(admin: SupabaseClient, reason: string, detail: string): Promise<void> {
  const { error } = await admin
    .from('invite_queue_settings')
    .update({ paused: true, pause_reason: reason, updated_by: null, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw dbError(error);
  await audit(admin, null, 'queue.paused', null, { reason, detail: detail.slice(0, 200) });
}

export interface RunSummary {
  /** Paused at the start, or during the run (an administrator, or the email limit). */
  paused: boolean;
  /** Another delivery of this quarter hour's cron already ran: this one did nothing. */
  duplicate: boolean;
  /** The email service's limit was reached: the queue paused itself. */
  limited: boolean;
  /** Stuck rows put back in the queue, given up on, or failed because they may have gone out. */
  requeued: number;
  gaveUp: number;
  unsure: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  cancelled: number;
  /** Rate limited: back in the queue for the next run. */
  retried: number;
}

export interface RunClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: RunClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * One cron run. Paused: nothing at all. A second delivery in the same quarter hour: nothing. Otherwise:
 * recover stuck rows, then — up to the per-run count — re-read the pause switch, claim one row, and
 * invite it, at least SEND_GAP_MS after the last email. Every claimed row ends sent, skipped, failed or
 * cancelled with a readable outcome (or back in the queue); one row's failure never stops the others.
 */
export async function runQueue(admin: SupabaseClient, clock: RunClock = realClock): Promise<RunSummary> {
  const started = clock.now();
  const summary: RunSummary = {
    paused: false, duplicate: false, limited: false, requeued: 0, gaveUp: 0, unsure: 0,
    claimed: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0, retried: 0,
  };
  const first = await readSettings(admin);
  if (first.paused) return { ...summary, paused: true };
  if (!(await takeSlot(admin, started))) return { ...summary, duplicate: true };

  Object.assign(summary, await recoverStuck(admin, started));
  const inviterOf = inviterLookup(admin);
  let lastMail = 0;

  for (let i = 0; i < first.perRun; i++) {
    if (clock.now() - started > RUN_BUDGET_MS) break;
    if (lastMail) {
      const wait = lastMail + SEND_GAP_MS - clock.now();
      if (wait > 0) await clock.sleep(wait);
    }
    if (i > 0 && (await readSettings(admin)).paused) {
      summary.paused = true;
      break;
    }
    const [row] = await claimQueued(admin, 1);
    if (!row) break;
    summary.claimed++;

    const brake: { why: Brake } = { why: null };
    let end: RowEnd;
    let limit: string | null = null;
    try {
      end = await inviteRow(admin, row, inviterOf, brake);
    } catch (err) {
      const text = message(err);
      limit = quotaReason(err);
      // No answer at all from the email service (no HTTP status): it may or may not have gone out.
      const unanswered = (err as EmailError)?.code === 'application_error' && (err as EmailError).status == null;
      end = limit
        ? { status: 'requeue', outcome: null }
        : busy(text)
          ? busyEnd(row)
          : { status: 'failed', outcome: unanswered ? OUTCOME.unsure : `Couldn’t send: ${text}` };
      if (limit) {
        try {
          await pauseItself(admin, limit, text);
        } catch (pauseErr) {
          console.error('[invite-queue] could not pause after the email limit', message(pauseErr));
        }
      }
    }
    if (end.status === 'sent' || end.status === 'failed' || end.status === 'retry') lastMail = clock.now();

    let recorded = true;
    try {
      recorded = await settle(admin, row, end);
    } catch (err) {
      console.error('[invite-queue] could not record a result', row.id, message(err));
    }
    if (!recorded) summary.cancelled++;
    else if (end.status === 'retry') summary.retried++;
    else if (end.status !== 'requeue') summary[end.status]++;

    if (limit) {
      summary.limited = true;
      summary.paused = true;
      break;
    }
    if (brake.why === 'paused') {
      summary.paused = true;
      break;
    }
    // Rate limited: back off until the next run (the row would otherwise be claimed again right away).
    if (end.status === 'retry') break;
  }

  const { error } = await admin
    .from('invite_queue_settings')
    .update({
      last_run_at: new Date(clock.now()).toISOString(),
      last_run: { claimed: summary.claimed, sent: summary.sent, skipped: summary.skipped, failed: summary.failed, cancelled: summary.cancelled },
    })
    .eq('id', true);
  if (error) console.error('[invite-queue] could not record the run', error.message);
  return summary;
}
