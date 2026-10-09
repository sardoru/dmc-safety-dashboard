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
  /** Invitations per run (5 by default). */
  perRun: number;
  /** Minutes between runs (15). */
  everyMinutes: number;
  nextRunAt: number;
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
  perRun: number;
  everyMinutes: number;
  nextRunAt: string;
  counts: QueueCounts;
  next: QueueRowJson[];
  recent: QueueRowJson[];
}

/** /api/admin/invite-queue → add. */
export interface AddResult {
  added: number;
  duplicates: number;
  invalid: number;
  skipped: number;
  invalidLines: { line: number; text: string }[];
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
    perRun: j.perRun,
    everyMinutes: j.everyMinutes,
    nextRunAt: ms(j.nextRunAt) ?? 0,
    counts: j.counts,
    next: j.next.map(rowToItem),
    recent: j.recent.map(rowToItem),
  };
}

/** Runs start on the quarter hour; the next one after `now`. */
export function nextRun(now: number, everyMinutes = 15): number {
  const step = everyMinutes * 60_000;
  return (Math.floor(now / step) + 1) * step;
}

/** When `adding` more go out, behind those already waiting: the first and the last of them. */
export function schedule(s: Pick<QueueState, 'counts' | 'perRun' | 'everyMinutes' | 'nextRunAt'>, adding: number) {
  const step = s.everyMinutes * 60_000;
  const ahead = s.counts.queued;
  const firstRun = Math.floor(ahead / s.perRun);
  const lastRun = Math.max(firstRun, Math.ceil((ahead + adding) / s.perRun) - 1);
  return { first: s.nextRunAt + firstRun * step, last: s.nextRunAt + lastRun * step, runs: lastRun - firstRun + 1 };
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
    perRun: 5,
    everyMinutes: 15,
    nextRunAt,
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
