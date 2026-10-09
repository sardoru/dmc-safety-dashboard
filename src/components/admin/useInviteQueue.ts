import { useCallback, useEffect, useState } from 'react';
import { parseEmailList } from '../../../api/_lib/emailList';
import { DEMO_BUSINESSES, DEMO_PERSONAS } from '../../data/demo';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import { messageOf } from '../account/util';
import { demoQueue, fromList, nextRun, type AddResult, type QueueItem, type QueueListJson, type QueueState } from './inviteQueue';

const ENDPOINT = '/api/admin/invite-queue';
const call = <T>(json: Record<string, unknown>) => apiFetch<T>(ENDPOINT, { method: 'POST', json });

/** A pasted list. Lists are for member businesses only. */
export interface ListInput {
  text: string;
  label: string;
  /** Queue people who were already invited, too (they get another invitation email). */
  reinvite: boolean;
}

export interface InviteQueue {
  /** Null until the first load (connected mode). */
  state: QueueState | null;
  error: string | null;
  refresh: () => void;
  /** What a list would queue — nothing is queued — and the queue's pace right now: for the confirm step. */
  preview: (input: ListInput) => Promise<AddResult>;
  add: (input: ListInput) => Promise<AddResult>;
  setPaused: (paused: boolean) => Promise<void>;
  /** One queued invitation, or every one still waiting. */
  cancel: (target: { id: string } | { all: true }) => Promise<number>;
}

/** Demo mode: the sample members count as already invited. */
const DEMO_MEMBERS = new Set([...DEMO_BUSINESSES.map((b) => b.email), ...Object.values(DEMO_PERSONAS).map((p) => p.email)]);

function demoCount(input: ListInput, s: QueueState | null) {
  const parsed = parseEmailList(input.text);
  const waiting = new Set(s?.next.map((i) => i.email));
  const invited = new Set([...DEMO_MEMBERS, ...(s?.recent.filter((i) => i.status === 'sent').map((i) => i.email) ?? [])]);
  const fresh = parsed.entries.filter((e) => !waiting.has(e.email));
  const repeat = fresh.filter((e) => invited.has(e.email));
  const chosen = input.reinvite ? fresh : fresh.filter((e) => !invited.has(e.email));
  const result: AddResult = {
    added: chosen.length,
    duplicates: parsed.duplicates,
    invalid: parsed.invalid.length,
    skipped: parsed.entries.length - fresh.length,
    alreadyInvited: input.reinvite ? 0 : repeat.length,
    reinvited: input.reinvite ? repeat.length : 0,
    invalidLines: parsed.invalid,
    alreadyInvitedEmails: input.reinvite ? [] : repeat.map((e) => e.email),
  };
  return { chosen, result };
}

/**
 * Invite a list's queue: /api/admin/invite-queue when connected — reloaded about 30 seconds after each
 * run while invitations are waiting — and sample data in demo mode, where every action is simulated.
 */
export function useInviteQueue(isDemo: boolean): InviteQueue {
  const now = useNow();
  const [state, setState] = useState<QueueState | null>(() => (isDemo ? demoQueue(now) : null));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    call<QueueListJson>({ action: 'list' })
      .then((r) => {
        if (!active) return;
        setState(fromList(r));
        setError(null);
      })
      .catch((err: unknown) => {
        if (active) setError(messageOf(err, 'Couldn’t load the queue.'));
      });
    return () => {
      active = false;
    };
  }, [isDemo, nonce]);

  useEffect(() => {
    if (isDemo || !state || state.paused || state.counts.queued + state.counts.sending === 0) return;
    const t = window.setTimeout(refresh, Math.max(state.nextRunAt + 30_000 - Date.now(), 15_000));
    return () => window.clearTimeout(t);
  }, [isDemo, state, refresh]);

  const preview = useCallback(
    async (input: ListInput): Promise<AddResult> => {
      if (!isDemo) {
        refresh();
        return call<AddResult>({ action: 'add', dryRun: true, ...input });
      }
      const { result } = demoCount(input, state);
      return state
        ? {
            ...result,
            queue: {
              queued: state.counts.queued,
              perRun: state.perRun,
              paused: state.paused,
              everyMinutes: state.everyMinutes,
              nextRunAt: new Date(nextRun(Date.now(), state.everyMinutes)).toISOString(),
            },
          }
        : result;
    },
    [isDemo, refresh, state],
  );

  const add = useCallback(
    async (input: ListInput): Promise<AddResult> => {
      if (!isDemo) {
        const result = await call<AddResult>({ action: 'add', ...input });
        refresh();
        return result;
      }
      const { chosen, result } = demoCount(input, state);
      setState((s) => {
        if (!s) return s;
        const items: QueueItem[] = chosen.map((e, i) => ({
          id: `demo-new-${Date.now()}-${i}`,
          email: e.email,
          name: e.name,
          label: input.label.trim() || null,
          role: 'business',
          status: 'queued',
          outcome: null,
          createdAt: Date.now(),
          claimedAt: null,
          sentAt: null,
        }));
        return {
          ...s,
          nextRunAt: nextRun(Date.now(), s.everyMinutes),
          counts: { ...s.counts, queued: s.counts.queued + items.length },
          next: [...s.next, ...items].slice(0, s.perRun),
        };
      });
      return result;
    },
    [isDemo, refresh, state],
  );

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (!isDemo) await call({ action: paused ? 'pause' : 'resume' });
      setState((s) => (s ? { ...s, paused, pauseReason: null } : s));
      if (!isDemo) refresh();
    },
    [isDemo, refresh],
  );

  const cancel = useCallback(
    async (target: { id: string } | { all: true }): Promise<number> => {
      let cancelled: number;
      if (!isDemo) {
        cancelled = (await call<{ cancelled: number }>({ action: 'cancel', ...target })).cancelled;
      } else {
        cancelled = 'id' in target ? 1 : (state?.counts.queued ?? 0);
      }
      setState((s) => {
        if (!s) return s;
        const left = 'id' in target ? s.next.filter((i) => i.id !== target.id) : [];
        return {
          ...s,
          counts: { ...s.counts, queued: Math.max(0, s.counts.queued - cancelled), cancelled: s.counts.cancelled + cancelled },
          next: left,
        };
      });
      if (!isDemo) refresh();
      return cancelled;
    },
    [isDemo, refresh, state],
  );

  return { state, error, refresh, preview, add, setPaused, cancel };
}
