import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedUser, Role } from './auth.js';
import { inviteByEmail, type Inviter } from './invite.js';
import { inviterName, normalizeEmail, roleOf, signedInBefore, standingOf } from './membership.js';

/**
 * Invite a list, paced: the queue an administrator fills in Admin → Team (`/api/admin/invite-queue`) and
 * the cron drains (`/api/cron/invites`, every 15 minutes) — a few addresses per run, 5 by default, each
 * invited exactly like Admin → Team → Invite someone (`api/_lib/invite.ts`). Tables: migration 0006.
 */

/** The cron's schedule in vercel.json: `*\/15 * * * *`. */
export const RUN_EVERY_MINUTES = 15;
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
  sent_at: string | null;
  attempts: number;
}

/** What Admin → Team sees of a row. */
export const ROW_FIELDS = 'id, email, name, label, role, status, outcome, created_at, claimed_at, sent_at, attempts';

export interface QueueSettings {
  paused: boolean;
  perRun: number;
}

/** The queue's tables or claim function aren't there: migration 0006 hasn't been applied. */
export class QueueNotReady extends Error {
  constructor() {
    super('Invite a list isn’t set up yet — apply migration 0006_invite_queue.sql.');
    this.name = 'QueueNotReady';
  }
}

/** A database error as an Error — QueueNotReady when the table or function is missing. */
export function dbError(error: { code?: string; message?: string }): Error {
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code ?? '')) return new QueueNotReady();
  return new Error(error.message || 'Database error');
}

/** The run after `now`: runs start on the quarter hour (:00, :15, :30, :45). */
export function nextRunAt(now: number): number {
  const step = RUN_EVERY_MINUTES * 60_000;
  return (Math.floor(now / step) + 1) * step;
}

export function clampPerRun(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PER_RUN) : DEFAULT_PER_RUN;
}

export async function readSettings(admin: SupabaseClient): Promise<QueueSettings> {
  const { data, error } = await admin.from('invite_queue_settings').select('paused, per_run').eq('id', true).maybeSingle();
  if (error) throw dbError(error);
  return { paused: Boolean(data?.paused), perRun: clampPerRun(data?.per_run ?? DEFAULT_PER_RUN) };
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

const ROLE_LABEL: Record<Role, string> = { business: 'Business', officer: 'Public Safety', admin: 'Administrator' };

export const OUTCOME = {
  member: 'Already a member',
  gaveUp: `Gave up after ${MAX_ATTEMPTS} tries — the send never finished. Add the address again to retry.`,
  busy: 'The email service was busy — trying again next run',
} as const;

/** How a claimed row ends; `retry` puts it back in the queue for the next run. */
type RowEnd = { status: 'sent' | 'skipped' | 'failed' | 'cancelled' | 'retry'; outcome: string };

/** Put rows whose run died back in the queue — or give up on them after MAX_ATTEMPTS claims. */
export async function recoverStuck(admin: SupabaseClient, now: number): Promise<{ requeued: number; gaveUp: number }> {
  const cutoff = new Date(now - STUCK_AFTER_MS).toISOString();
  const requeue = await admin
    .from('invite_queue')
    .update({ status: 'queued', claimed_at: null })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .lt('attempts', MAX_ATTEMPTS)
    .select('id');
  if (requeue.error) throw dbError(requeue.error);
  const giveUp = await admin
    .from('invite_queue')
    .update({ status: 'failed', outcome: OUTCOME.gaveUp })
    .eq('status', 'sending')
    .lt('claimed_at', cutoff)
    .gte('attempts', MAX_ATTEMPTS)
    .select('id');
  if (giveUp.error) throw dbError(giveUp.error);
  return { requeued: requeue.data?.length ?? 0, gaveUp: giveUp.data?.length ?? 0 };
}

/** The oldest `n` queued rows, now `sending` and this run's alone (claim_queued_invites, FOR UPDATE SKIP LOCKED). */
export async function claimQueued(admin: SupabaseClient, n: number): Promise<QueueRow[]> {
  const { data, error } = await admin.rpc('claim_queued_invites', { n });
  if (error) throw dbError(error);
  return ((data ?? []) as QueueRow[]).sort((a, b) => a.seq - b.seq);
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
const busy = (text: string) => /too many requests|rate.?limit/i.test(text);

/** Invite one claimed row the way Invite someone does — unless its address already uses the dashboard. */
async function inviteRow(admin: SupabaseClient, row: QueueRow, inviterOf: ReturnType<typeof inviterLookup>): Promise<RowEnd> {
  const from = await inviterOf(row.queued_by);
  if (!from) return { status: 'cancelled', outcome: 'Not sent: whoever queued it is no longer an administrator' };
  const email = normalizeEmail(row.email);
  if (!email) return { status: 'failed', outcome: 'Not a valid email address' };

  // People who already use the dashboard aren't invited again; an account whose first invite was
  // never opened gets the invitation again, as Invite someone does.
  const { account } = await standingOf(admin, email);
  if (account && (await signedInBefore(admin, account.id))) return { status: 'skipped', outcome: OUTCOME.member };

  const requested = roleOf(row.role);
  const result = await inviteByEmail(admin, email, requested, from, { via: 'queue' });
  if (result.kind === 'no-link') return { status: 'failed', outcome: `Couldn’t make a sign-in link: ${result.error}` };
  if (!result.emailed) return { status: 'failed', outcome: 'Couldn’t make a sign-in link — nothing was sent' };
  const raised = result.role !== requested ? ` as ${ROLE_LABEL[result.role]} — an invitation never lowers a role` : '';
  if (result.status !== 'invited') return { status: 'sent', outcome: `Sign-in link sent — they already have an account${raised}` };
  return { status: 'sent', outcome: account ? `Invitation sent again — the first was never opened${raised}` : `Invitation sent${raised}` };
}

async function settle(admin: SupabaseClient, row: QueueRow, end: RowEnd): Promise<void> {
  const outcome = end.outcome.slice(0, 500);
  const patch =
    end.status === 'retry'
      ? { status: 'queued', claimed_at: null, outcome }
      : { status: end.status, outcome, ...(end.status === 'sent' ? { sent_at: new Date().toISOString() } : {}) };
  let last: { message?: string } | null = null;
  // One retry: a row left `sending` is sent again once it counts as stuck.
  for (let i = 0; i < 2; i++) {
    const { error } = await admin.from('invite_queue').update(patch).eq('id', row.id).eq('status', 'sending');
    if (!error) return;
    last = error;
  }
  throw new Error(last?.message || 'Could not record the result');
}

export interface RunSummary {
  paused: boolean;
  /** Stuck rows put back in the queue, and stuck rows given up on. */
  requeued: number;
  gaveUp: number;
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  cancelled: number;
  /** The email service was busy: back in the queue for the next run. */
  retried: number;
  /** Claimed but not started before the time budget ran out: back in the queue. */
  released: number;
}

export interface RunClock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: RunClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * One cron run. Paused: nothing at all. Otherwise: recover stuck rows, claim up to the per-run count,
 * and invite each in turn, at least SEND_GAP_MS between emails. Every claimed row ends sent, skipped,
 * failed or cancelled with a readable outcome — one row's failure never stops the others.
 */
export async function runQueue(admin: SupabaseClient, clock: RunClock = realClock): Promise<RunSummary> {
  const started = clock.now();
  const summary: RunSummary = { paused: false, requeued: 0, gaveUp: 0, claimed: 0, sent: 0, skipped: 0, failed: 0, cancelled: 0, retried: 0, released: 0 };
  const settings = await readSettings(admin);
  if (settings.paused) return { ...summary, paused: true };

  Object.assign(summary, await recoverStuck(admin, started));
  const rows = await claimQueued(admin, settings.perRun);
  summary.claimed = rows.length;
  const inviterOf = inviterLookup(admin);
  let lastMail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (clock.now() - started > RUN_BUDGET_MS) {
      // Back in the queue as they were, attempt not counted.
      for (const r of rows.slice(i)) {
        const { error } = await admin
          .from('invite_queue')
          .update({ status: 'queued', claimed_at: null, attempts: Math.max(0, r.attempts - 1) })
          .eq('id', r.id)
          .eq('status', 'sending');
        if (!error) summary.released++;
      }
      break;
    }
    if (lastMail) {
      const wait = lastMail + SEND_GAP_MS - clock.now();
      if (wait > 0) await clock.sleep(wait);
    }

    let end: RowEnd;
    try {
      end = await inviteRow(admin, row, inviterOf);
    } catch (err) {
      const text = message(err);
      end = busy(text)
        ? row.attempts >= MAX_ATTEMPTS
          ? { status: 'failed', outcome: `Couldn’t send: the email service was busy ${MAX_ATTEMPTS} times. Add the address again to retry.` }
          : { status: 'retry', outcome: OUTCOME.busy }
        : { status: 'failed', outcome: `Couldn’t send: ${text}` };
    }
    if (end.status === 'sent' || end.status === 'failed' || end.status === 'retry') lastMail = clock.now();

    try {
      await settle(admin, row, end);
    } catch (err) {
      console.error('[invite-queue] could not record a result', row.id, message(err));
    }
    if (end.status === 'retry') summary.retried++;
    else summary[end.status]++;
  }
  return summary;
}
