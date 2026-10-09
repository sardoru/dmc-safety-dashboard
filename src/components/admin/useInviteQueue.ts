import { useCallback, useEffect, useState } from 'react';
import { parseEmailList } from '../../../api/_lib/emailList';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import type { Role } from '../../types';
import { messageOf } from '../account/util';
import { demoQueue, fromList, nextRun, type AddResult, type QueueItem, type QueueListJson, type QueueState } from './inviteQueue';

const ENDPOINT = '/api/admin/invite-queue';
const call = <T>(json: Record<string, unknown>) => apiFetch<T>(ENDPOINT, { method: 'POST', json });

export interface InviteQueue {
  /** Null until the first load (connected mode). */
  state: QueueState | null;
  error: string | null;
  refresh: () => void;
  add: (input: { text: string; role: Role; label: string }) => Promise<AddResult>;
  setPaused: (paused: boolean) => Promise<void>;
  /** One queued invitation, or every one still waiting. */
  cancel: (target: { id: string } | { all: true }) => Promise<number>;
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

  const add = useCallback(
    async (input: { text: string; role: Role; label: string }): Promise<AddResult> => {
      if (!isDemo) {
        const result = await call<AddResult>({ action: 'add', ...input });
        refresh();
        return result;
      }
      const parsed = parseEmailList(input.text);
      const waiting = new Set(state?.next.map((i) => i.email));
      const fresh = parsed.entries.filter((e) => !waiting.has(e.email));
      setState((s) => {
        if (!s) return s;
        const items: QueueItem[] = fresh.map((e, i) => ({
          id: `demo-new-${Date.now()}-${i}`,
          email: e.email,
          name: e.name,
          label: input.label.trim() || null,
          role: input.role,
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
      return {
        added: fresh.length,
        duplicates: parsed.duplicates,
        invalid: parsed.invalid.length,
        skipped: parsed.entries.length - fresh.length,
        invalidLines: parsed.invalid,
      };
    },
    [isDemo, refresh, state],
  );

  const setPaused = useCallback(
    async (paused: boolean) => {
      if (!isDemo) await call({ action: paused ? 'pause' : 'resume' });
      setState((s) => (s ? { ...s, paused } : s));
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

  return { state, error, refresh, add, setPaused, cancel };
}
