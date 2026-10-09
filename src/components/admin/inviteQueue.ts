/** Invite a list — the paced queue's types, schedule math, chips and demo samples. */
import { format, isSameDay } from 'date-fns';
import type { Role } from '../../types';

export type QueueStatus = 'queued' | 'sending' | 'sent' | 'skipped' | 'failed' | 'cancelled';
export type QueueCounts = Record<QueueStatus, number>;

export interface QueueItem {
  id: string;
  email: string;
  name: string | null;
  label: string | null;
  role: Role;
  status: QueueStatus;
  /** What happened, in words ("Invitation sent", "Already a member", "Couldn’t send: …"). */
  outcome: string | null;
  createdAt: number;
  /** When a run picked it up (null while it waits). */
  claimedAt: number | null;
  sentAt: number | null;
}

export interface QueueState {
  paused: boolean;
  /** Why the queue paused itself ("the daily email limit was reached"); null when an administrator paused it. */
  pauseReason: string | null;
  /** Invitations per run (5 by default). */
  perRun: number;
  /** Minutes between runs (15). */
  everyMinutes: number;
  nextRunAt: number;
  /** The last run, and what it did. */
  lastRunAt: number | null;
  lastRun: { claimed?: number; sent?: number; skipped?: number; failed?: number; cancelled?: number } | null;
  /** When pause / resume last changed. */
  changedAt: number | null;
  /** When the oldest waiting invitation was queued. */
  oldestQueuedAt: number | null;
  counts: QueueCounts;
  /** The next run's batch, in order. */
  next: QueueItem[];
  /** What the runs did, newest first. */
  recent: QueueItem[];
}

/** /api/admin/invite-queue → list. */
export interface QueueRowJson {
  id: string;
  email: string;
  name: string | null;
  label: string | null;
  role: string;
  status: QueueStatus;
  outcome: string | null;
  created_at: string;
  claimed_at: string | null;
  sent_at: string | null;
}
export interface QueueListJson {
  paused: boolean;
  pauseReason: string | null;
  perRun: number;
  everyMinutes: number;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRun: QueueState['lastRun'];
  changedAt: string | null;
  oldestQueuedAt: string | null;
  counts: QueueCounts;
  next: QueueRowJson[];
  recent: QueueRowJson[];
}

/** /api/admin/invite-queue → add (and its dry run, for the confirm step). */
export interface AddResult {
  /** Queued — or, in a dry run, would be queued. */
  added: number;
  duplicates: number;
  invalid: number;
  /** Already waiting in the queue. */
  skipped: number;
  /** Already invited (sent from a list, an open invitation, or an account) — not queued again. */
  alreadyInvited: number;
  /** Already invited, but queued again on purpose (Invite again). */
  reinvited: number;
  invalidLines: { line: number; text: string }[];
  alreadyInvitedEmails: string[];
  dryRun?: boolean;
  /** Dry run: the queue's pace right now. */
  queue?: { queued: number; perRun: number; paused: boolean; everyMinutes: number; nextRunAt: string };
}

export const COUNTED: QueueStatus[] = ['queued', 'sent', 'skipped', 'failed', 'cancelled'];

export const STATUS_LABEL: Record<QueueStatus, string> = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const STATUS_TONE: Record<QueueStatus, string> = {
  queued: 'bg-accent-soft text-accent-strong',
  sending: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  sent: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  skipped: 'bg-surface-3 text-muted',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-300',
  cancelled: 'bg-surface-3 text-subtle',
};

/** The number's colour in the counts row, once it's above zero. */
export const COUNT_TONE: Record<QueueStatus, string> = {
  queued: 'text-accent-strong',
  sending: 'text-amber-600 dark:text-amber-400',
  sent: 'text-emerald-600 dark:text-emerald-400',
  skipped: 'text-ink',
  failed: 'text-red-600 dark:text-red-400',
  cancelled: 'text-ink',
};

const ms = (s: string | null) => (s ? new Date(s).getTime() : null);
const toRole = (r: string): Role => (r === 'admin' || r === 'officer' ? r : 'business');

export function rowToItem(r: QueueRowJson): QueueItem {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    label: r.label,
    role: toRole(r.role),
    status: r.status,
    outcome: r.outcome,
    createdAt: ms(r.created_at) ?? 0,
    claimedAt: ms(r.claimed_at),
    sentAt: ms(r.sent_at),
  };
}

export function fromList(j: QueueListJson): QueueState {
  return {
    paused: j.paused,
    pauseReason: j.pauseReason ?? null,
    perRun: j.perRun,
    everyMinutes: j.everyMinutes,
    nextRunAt: ms(j.nextRunAt) ?? 0,
    lastRunAt: ms(j.lastRunAt ?? null),
    lastRun: j.lastRun ?? null,
    changedAt: ms(j.changedAt ?? null),
    oldestQueuedAt: ms(j.oldestQueuedAt ?? null),
    counts: j.counts,
    next: j.next.map(rowToItem),
    recent: j.recent.map(rowToItem),
  };
}

/** No run has happened for this long while invitations wait: the scheduled sender may be off. */
export const STALE_AFTER_MS = 20 * 60_000;

/**
 * Invitations are waiting, the queue isn't paused, and nothing has run for over 20 minutes — counted
 * from the last run, the last pause/resume, or when the oldest waiting one was queued, whichever is latest.
 */
export function looksStalled(s: QueueState, now: number): boolean {
  if (s.paused || s.counts.queued === 0) return false;
  const since = Math.max(s.lastRunAt ?? 0, s.changedAt ?? 0, s.oldestQueuedAt ?? 0);
  return since > 0 && now - since > STALE_AFTER_MS;
}

/** Runs start on the quarter hour; the next one after `now`. */
export function nextRun(now: number, everyMinutes = 15): number {
  const step = everyMinutes * 60_000;
  return (Math.floor(now / step) + 1) * step;
}

/** When `adding` more go out, behind those already waiting: the first and the last of them. */
export function schedule(s: Pick<QueueState, 'counts' | 'perRun' | 'everyMinutes' | 'nextRunAt'>, adding: number, now: number) {
  const step = s.everyMinutes * 60_000;
  // Never in the past: a next-run time loaded a while ago gives way to the coming quarter hour.
  const base = Math.max(s.nextRunAt, nextRun(now, s.everyMinutes));
  const ahead = s.counts.queued;
  const firstRun = Math.floor(ahead / s.perRun);
  const lastRun = Math.max(firstRun, Math.ceil((ahead + adding) / s.perRun) - 1);
  return { first: base + firstRun * step, last: base + lastRun * step, runs: lastRun - firstRun + 1 };
}

/** "2:45 PM" today, "Fri 1:15 AM" another day. */
export function clockAt(ts: number, now: number): string {
  return isSameDay(ts, now) ? format(ts, 'h:mm a') : format(ts, 'EEE h:mm a');
}

// ── Demo samples ─────────────────────────────────────────────────────────────
// Fictional storefronts on real downtown streets (.example addresses), like the rest of the demo data.

const DEMO_LABEL = 'Safety Meeting · Oct 8';

export function demoQueue(now: number): QueueState {
  const nextRunAt = nextRun(now);
  const lastRun = nextRunAt - 15 * 60_000;
  const runBefore = lastRun - 15 * 60_000;
  let n = 0;
  const item = (email: string, name: string | null, status: QueueStatus, outcome: string | null, claimedAt: number | null): QueueItem => ({
    id: `demo-q-${++n}`,
    email,
    name,
    label: DEMO_LABEL,
    role: 'business',
    status,
    outcome,
    createdAt: now - 3 * 3_600_000,
    claimedAt,
    sentAt: status === 'sent' && claimedAt ? claimedAt + n * 900 : null,
  });
  const sent = (email: string, name: string, at: number) => item(email, name, 'sent', 'Invitation sent', at);
  return {
    paused: false,
    pauseReason: null,
    perRun: 5,
    everyMinutes: 15,
    nextRunAt,
    lastRunAt: lastRun + 5_000,
    lastRun: { claimed: 5, sent: 4, skipped: 1, failed: 0, cancelled: 0 },
    changedAt: null,
    oldestQueuedAt: now - 3 * 3_600_000,
    counts: { queued: 72, sending: 0, sent: 16, skipped: 2, failed: 1, cancelled: 1 },
    next: [
      item('orders@pinchhardware.example', 'Pinch Hardware', 'queued', null, null),
      item('bbq@bealeandthird.example', 'Beale & Third Smokehouse · Andre W.', 'queued', null, null),
      item('fittings@monroetailors.example', 'Monroe Avenue Tailors', 'queued', null, null),
      item('hello@frontstreetoptical.example', 'Front Street Optical', 'queued', null, null),
      item('shop@unionvinyl.example', null, 'queued', null, null),
    ],
    recent: [
      sent('frontdesk@adamsavelofts.example', 'Adams Avenue Lofts · front desk', lastRun + 4_000),
      sent('info@gayosogrocer.example', 'Gayoso Grocer · Nia Grant', lastRun + 3_000),
      item('dana@riverbluff.example', 'Riverbluff Coffee Co.', 'skipped', 'Already a member', lastRun + 2_000),
      sent('manager@peabodyalleycafe.example', 'Peabody Alley Cafe', lastRun + 1_000),
      item('owner@bluffcityprints.example', 'Bluff City Prints', 'sent', 'Invitation sent again — the first was never opened', lastRun),
      sent('team@southmainflowers.example', 'South Main Flowers', runBefore + 4_000),
      item('events@cottonrowhall.example', 'Cotton Row Hall', 'failed', 'Couldn’t send: The to address is not valid.', runBefore + 3_000),
      sent('shop@vancegallery.example', 'Vance Avenue Gallery', runBefore + 2_000),
      item('hello@courtsquarebooks.example', 'Court Square Books', 'skipped', 'Already a member', runBefore + 1_000),
      sent('orders@secondstreetbakery.example', 'Second Street Bakery', runBefore),
    ],
  };
}
