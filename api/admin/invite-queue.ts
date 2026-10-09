import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole, type AuthedUser } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { methodNotAllowed, readBody, sendError, sendJson } from '../_lib/http.js';
import { audit, inviterName } from '../_lib/membership.js';
import { MAX_LIST_CHARS, MAX_LIST_ENTRIES, parseEmailList } from '../_lib/emailList.js';
import {
  countByStatus,
  dbError,
  nextRunAt,
  QueueNotReady,
  readSettings,
  ROW_FIELDS,
  RUN_EVERY_MINUTES,
} from '../_lib/inviteQueue.js';

/**
 * Admin only — Invite a list (Admin → Team), sent a few at a time by /api/cron/invites:
 *
 *   { action: 'add', text, label?, reinvite?, dryRun? }
 *       → { added, duplicates, invalid, skipped, alreadyInvited, reinvited, invalidLines, alreadyInvitedEmails }
 *       Pasted text, one address per line ("Name <email>" and stray commas or semicolons are fine).
 *       Lists are for member businesses only: `role` may be omitted or 'business' (anything else is a 400 —
 *       invite officers and administrators one at a time with Invite someone).
 *       Skipped: addresses already waiting in the queue (`skipped`), and — unless `reinvite: true` —
 *       addresses already invited: a sent row, an open invitation, or an account (`alreadyInvited`).
 *       `dryRun: true` counts without queueing (plus the queue's pace, for the confirm step).
 *   { action: 'list' }  → { paused, pauseReason, perRun, everyMinutes, nextRunAt, lastRunAt, lastRun,
 *                           changedAt, oldestQueuedAt, counts, next, recent }
 *   { action: 'pause' } / { action: 'resume' } → { paused }
 *   { action: 'cancel', all: true } | { action: 'cancel', label } | { action: 'cancel', id } → { cancelled }
 *       Rows still queued, and rows a run has claimed whose email hasn't started. An email already on
 *       its way finishes.
 *
 * Every change is written to the audit log. The queue itself is server-only (migrations 0006, 0008).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class BadRequest extends Error {}

/** "  Safety   Meeting · Mar 11 " → "Safety Meeting · Mar 11"; blank → null. */
function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return label || null;
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Of these addresses: which are waiting in the queue, and which were invited already. */
async function standings(admin: SupabaseClient, emails: string[]) {
  const waiting = new Set<string>();
  const invited = new Set<string>();
  for (const part of chunks(emails, 100)) {
    const [live, sent, open, accounts] = await Promise.all([
      admin.from('invite_queue').select('email').in('status', ['queued', 'sending']).in('email', part),
      admin.from('invite_queue').select('email').eq('status', 'sent').in('email', part),
      admin.from('officer_invites').select('email').eq('status', 'pending').in('email', part),
      admin.from('profiles').select('email').in('email', part),
    ]);
    for (const r of [live, sent, open, accounts]) if (r.error) throw dbError(r.error);
    for (const r of live.data ?? []) waiting.add(String(r.email).toLowerCase());
    for (const res of [sent, open, accounts]) for (const r of res.data ?? []) invited.add(String(r.email).toLowerCase());
  }
  return { waiting, invited };
}

async function add(admin: SupabaseClient, actor: AuthedUser, body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) throw new BadRequest('Paste at least one email address');
  if (text.length > MAX_LIST_CHARS) throw new BadRequest(`That’s too much at once — paste up to ${MAX_LIST_ENTRIES} addresses at a time`);
  if (body.role !== undefined && body.role !== null && body.role !== 'business') {
    throw new BadRequest('Invite a list is for member businesses only. Invite officers and administrators one at a time with Invite someone.');
  }
  const label = cleanLabel(body.label);
  const reinvite = body.reinvite === true;
  const dryRun = body.dryRun === true;

  const parsed = parseEmailList(text);
  if (parsed.entries.length > MAX_LIST_ENTRIES) {
    throw new BadRequest(`That’s ${parsed.entries.length} addresses — paste up to ${MAX_LIST_ENTRIES} at a time`);
  }

  const { waiting, invited } = await standings(admin, parsed.entries.map((e) => e.email));
  const fresh = parsed.entries.filter((e) => !waiting.has(e.email));
  const repeat = fresh.filter((e) => invited.has(e.email));
  const chosen = reinvite ? fresh : fresh.filter((e) => !invited.has(e.email));
  const counts = {
    duplicates: parsed.duplicates,
    invalid: parsed.invalid.length,
    skipped: parsed.entries.length - fresh.length,
    alreadyInvited: reinvite ? 0 : repeat.length,
    reinvited: reinvite ? repeat.length : 0,
  };
  const lists = { invalidLines: parsed.invalid.slice(0, 50), alreadyInvitedEmails: reinvite ? [] : repeat.slice(0, 50).map((e) => e.email) };

  if (dryRun) {
    // What the confirm step needs to say when they'd go out.
    const [settings, { queued }] = await Promise.all([readSettings(admin), countByStatus(admin)]);
    return {
      dryRun: true,
      added: chosen.length,
      ...counts,
      ...lists,
      queue: { queued, perRun: settings.perRun, paused: settings.paused, everyMinutes: RUN_EVERY_MINUTES, nextRunAt: new Date(nextRunAt(Date.now())).toISOString() },
    };
  }

  const rows = chosen.map((e) => ({ email: e.email, name: e.name, label, role: 'business', queued_by: actor.id }));
  let added = 0;
  if (rows.length) {
    const { error } = await admin.from('invite_queue').insert(rows);
    if (!error) {
      added = rows.length;
    } else if (error.code === '23505') {
      // Someone queued one of these in the meantime: add the rest one by one.
      for (const row of rows) {
        const { error: one } = await admin.from('invite_queue').insert(row);
        if (!one) added++;
        else if (one.code === '23505') counts.skipped++;
        else throw dbError(one);
      }
    } else {
      throw dbError(error);
    }
  }

  const result = { added, ...counts };
  if (added) await audit(admin, actor, 'queue.added', label, { ...result, role: 'business', ...(reinvite ? { reinvite: true } : {}), ...(label ? { label } : {}) });
  return { ...result, ...lists };
}

async function list(admin: SupabaseClient) {
  const now = Date.now();
  const [settings, counts, next, recent] = await Promise.all([
    readSettings(admin),
    countByStatus(admin),
    admin.from('invite_queue').select(ROW_FIELDS).eq('status', 'queued').order('seq', { ascending: true }).limit(10),
    // What the runs have worked on, newest first.
    admin
      .from('invite_queue')
      .select(ROW_FIELDS)
      .not('claimed_at', 'is', null)
      .order('claimed_at', { ascending: false })
      .order('seq', { ascending: false })
      .limit(30),
  ]);
  if (next.error) throw dbError(next.error);
  if (recent.error) throw dbError(recent.error);
  const queued = next.data ?? [];
  return {
    paused: settings.paused,
    pauseReason: settings.pauseReason,
    perRun: settings.perRun,
    everyMinutes: RUN_EVERY_MINUTES,
    nextRunAt: new Date(nextRunAt(now)).toISOString(),
    lastRunAt: settings.lastRunAt,
    lastRun: settings.lastRun,
    changedAt: settings.changedAt,
    oldestQueuedAt: (queued[0]?.created_at as string | undefined) ?? null,
    counts,
    next: queued.slice(0, settings.perRun),
    recent: recent.data ?? [],
  };
}

async function setPaused(admin: SupabaseClient, actor: AuthedUser, paused: boolean) {
  const settings = await readSettings(admin);
  if (settings.paused === paused) return { paused };
  const { error } = await admin
    .from('invite_queue_settings')
    .upsert({ id: true, paused, pause_reason: null, per_run: settings.perRun, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw dbError(error);
  const { queued } = await countByStatus(admin);
  await audit(admin, actor, paused ? 'queue.paused' : 'queue.resumed', null, { queued, ...(settings.pauseReason ? { after: settings.pauseReason } : {}) });
  return { paused };
}

async function cancel(admin: SupabaseClient, actor: AuthedUser, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : null;
  const label = id ? null : cleanLabel(body.label);
  if (id && !UUID.test(id)) throw new BadRequest('Missing invitation');
  if (!id && !label && body.all !== true) throw new BadRequest('Say what to cancel: one invitation, a label, or all of them');

  const who = (await inviterName(admin, actor)) ?? actor.email ?? 'an administrator';
  const patch = { status: 'cancelled', outcome: `Cancelled by ${who}` };
  // Waiting rows, and rows a run has claimed whose email hasn't started (that run then skips them).
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (id ? q.eq('id', id) : label ? q.eq('label', label) : q);
  const [waiting, claimed] = await Promise.all([
    scope(admin.from('invite_queue').update(patch).eq('status', 'queued')).select('id, email'),
    scope(admin.from('invite_queue').update(patch).eq('status', 'sending').is('emailing_at', null)).select('id, email'),
  ]);
  if (waiting.error) throw dbError(waiting.error);
  if (claimed.error) throw dbError(claimed.error);
  const rows = [...(waiting.data ?? []), ...(claimed.data ?? [])];
  if (id && !rows.length) return null;
  if (rows.length) {
    await audit(admin, actor, 'queue.cancelled', id ? String(rows[0].email) : label, {
      count: rows.length,
      scope: id ? 'one' : label ? 'label' : 'all',
    });
  }
  return { cancelled: rows.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;
  const guard = await requireRole(req, ['admin']);
  if (!guard.ok) return sendError(res, guard.status, guard.error);
  const actor = guard.user;
  const body = readBody<Record<string, unknown>>(req);

  try {
    const admin = getAdmin();
    switch (body.action) {
      case 'add':
        return sendJson(res, 200, await add(admin, actor, body));
      case 'list':
        return sendJson(res, 200, await list(admin));
      case 'pause':
      case 'resume':
        return sendJson(res, 200, await setPaused(admin, actor, body.action === 'pause'));
      case 'cancel': {
        const result = await cancel(admin, actor, body);
        if (!result) return sendError(res, 409, 'That invitation already went out or was cancelled');
        return sendJson(res, 200, result);
      }
      default:
        return sendError(res, 400, 'Unknown action');
    }
  } catch (err) {
    if (err instanceof BadRequest) return sendError(res, 400, err.message);
    if (err instanceof QueueNotReady) return sendError(res, 503, err.message);
    console.error('[admin/invite-queue]', body.action, err instanceof Error ? err.message : err);
    return sendError(res, 500, err instanceof Error ? err.message : 'Something went wrong');
  }
}
