import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireRole, type AuthedUser } from '../_lib/auth.js';
import { getAdmin } from '../_lib/supabaseAdmin.js';
import { methodNotAllowed, readBody, sendError, sendJson } from '../_lib/http.js';
import { audit, inviterName, parseRole } from '../_lib/membership.js';
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
 *   { action: 'add', text, role?, label? }   → { added, duplicates, invalid, skipped, invalidLines }
 *       Pasted text, one address per line ("Name <email>" and stray commas or semicolons are fine).
 *       role: business (default) | officer | admin. Addresses already waiting in the queue are skipped.
 *   { action: 'list' }                        → { paused, perRun, everyMinutes, nextRunAt, counts, next, recent }
 *   { action: 'pause' } / { action: 'resume' } → { paused }
 *   { action: 'cancel', all: true } | { action: 'cancel', label } | { action: 'cancel', id } → { cancelled }
 *       Only rows still queued; one being sent right now finishes.
 *
 * Every change is written to the audit log. The queue itself is server-only (migration 0006).
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

async function add(admin: SupabaseClient, actor: AuthedUser, body: Record<string, unknown>) {
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) throw new BadRequest('Paste at least one email address');
  if (text.length > MAX_LIST_CHARS) throw new BadRequest(`That’s too much at once — paste up to ${MAX_LIST_ENTRIES} addresses at a time`);
  const role = body.role === undefined || body.role === null ? 'business' : parseRole(body.role);
  if (!role) throw new BadRequest('Choose a role: business, officer or admin');
  const label = cleanLabel(body.label);

  const parsed = parseEmailList(text);
  if (parsed.entries.length > MAX_LIST_ENTRIES) {
    throw new BadRequest(`That’s ${parsed.entries.length} addresses — paste up to ${MAX_LIST_ENTRIES} at a time`);
  }

  // Addresses already waiting (or being sent) stay where they are.
  const waiting = new Set<string>();
  for (const part of chunks(parsed.entries.map((e) => e.email), 100)) {
    const { data, error } = await admin.from('invite_queue').select('email').in('status', ['queued', 'sending']).in('email', part);
    if (error) throw dbError(error);
    for (const r of data ?? []) waiting.add(String(r.email));
  }
  const rows = parsed.entries
    .filter((e) => !waiting.has(e.email))
    .map((e) => ({ email: e.email, name: e.name, label, role, queued_by: actor.id }));

  let added = 0;
  let skipped = parsed.entries.length - rows.length;
  if (rows.length) {
    const { error } = await admin.from('invite_queue').insert(rows);
    if (!error) {
      added = rows.length;
    } else if (error.code === '23505') {
      // Someone queued one of these in the meantime: add the rest one by one.
      for (const row of rows) {
        const { error: one } = await admin.from('invite_queue').insert(row);
        if (!one) added++;
        else if (one.code === '23505') skipped++;
        else throw dbError(one);
      }
    } else {
      throw dbError(error);
    }
  }

  const result = { added, duplicates: parsed.duplicates, invalid: parsed.invalid.length, skipped };
  if (added) await audit(admin, actor, 'queue.added', label, { ...result, role, ...(label ? { label } : {}) });
  return { ...result, invalidLines: parsed.invalid.slice(0, 50) };
}

async function list(admin: SupabaseClient) {
  const now = Date.now();
  const [settings, counts, next, recent] = await Promise.all([
    readSettings(admin),
    countByStatus(admin),
    admin.from('invite_queue').select(ROW_FIELDS).eq('status', 'queued').order('seq', { ascending: true }).limit(10),
    // What the cron has worked on, newest first.
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
  return {
    paused: settings.paused,
    perRun: settings.perRun,
    everyMinutes: RUN_EVERY_MINUTES,
    nextRunAt: new Date(nextRunAt(now)).toISOString(),
    counts,
    next: (next.data ?? []).slice(0, settings.perRun),
    recent: recent.data ?? [],
  };
}

async function setPaused(admin: SupabaseClient, actor: AuthedUser, paused: boolean) {
  const settings = await readSettings(admin);
  if (settings.paused === paused) return { paused };
  const { error } = await admin
    .from('invite_queue_settings')
    .upsert({ id: true, paused, per_run: settings.perRun, updated_by: actor.id, updated_at: new Date().toISOString() });
  if (error) throw dbError(error);
  const { queued } = await countByStatus(admin);
  await audit(admin, actor, paused ? 'queue.paused' : 'queue.resumed', null, { queued });
  return { paused };
}

async function cancel(admin: SupabaseClient, actor: AuthedUser, body: Record<string, unknown>) {
  const id = typeof body.id === 'string' ? body.id : null;
  const label = id ? null : cleanLabel(body.label);
  if (id && !UUID.test(id)) throw new BadRequest('Missing invitation');
  if (!id && !label && body.all !== true) throw new BadRequest('Say what to cancel: one invitation, a label, or all of them');

  const who = (await inviterName(admin, actor)) ?? actor.email ?? 'an administrator';
  let query = admin.from('invite_queue').update({ status: 'cancelled', outcome: `Cancelled by ${who}` }).eq('status', 'queued');
  if (id) query = query.eq('id', id);
  else if (label) query = query.eq('label', label);
  const { data, error } = await query.select('id, email');
  if (error) throw dbError(error);
  const cancelled = data?.length ?? 0;
  if (id && !cancelled) return null;
  if (cancelled) {
    await audit(admin, actor, 'queue.cancelled', id ? String(data![0].email) : label, {
      count: cancelled,
      scope: id ? 'one' : label ? 'label' : 'all',
    });
  }
  return { cancelled };
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
