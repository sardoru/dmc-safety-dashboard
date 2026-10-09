import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  demoAudit,
  demoCodes,
  demoWaitlist,
  rowToCode,
  type AccessCode,
  type AuditEntry,
  type CodeRole,
  type CodeRow,
  type WaitlistEntry,
} from './membership';

export interface NewCodeInput {
  label: string;
  role: CodeRole;
  seats: number;
  expiresAt: number | null;
  /** Optional custom code; blank = generated (XXXX-XXXX). */
  code?: string;
}

interface Snapshot {
  codes: AccessCode[];
  waitlist: WaitlistEntry[];
  audit: AuditEntry[];
  error: string | null;
}

const EMPTY: Snapshot = { codes: [], waitlist: [], audit: [], error: null };

/** Access codes (with redemptions), open waitlist requests and the audit log. */
export function useMembership() {
  const { isDemo } = useAuth();
  const now = useNow();
  const [nonce, setNonce] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [demo, setDemo] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    Promise.all([
      supabase.from('access_codes').select('*, access_code_redemptions(*)').order('created_at', { ascending: false }),
      supabase.from('waitlist').select('id, email, name, organization, note, created_at').eq('status', 'pending').order('created_at', { ascending: true }),
      supabase.from('audit_log').select('id, actor_label, action, target, meta, created_at').order('created_at', { ascending: false }).limit(150),
    ]).then(([codes, waitlist, audit]) => {
      if (!active) return;
      setSnap((prev) => ({
        // A failed read keeps what is on screen.
        codes: codes.error ? (prev?.codes ?? []) : ((codes.data ?? []) as CodeRow[]).map(rowToCode),
        waitlist: waitlist.error
          ? (prev?.waitlist ?? [])
          : (waitlist.data ?? []).map((w) => ({
              id: w.id as string,
              email: w.email as string,
              name: (w.name as string) ?? '',
              organization: (w.organization as string) ?? '',
              note: (w.note as string) ?? '',
              createdAt: new Date(w.created_at as string).getTime(),
            })),
        audit: audit.error
          ? (prev?.audit ?? [])
          : (audit.data ?? []).map((a) => ({
              id: a.id as string,
              actor: (a.actor_label as string) ?? 'System',
              action: a.action as string,
              target: (a.target as string | null) ?? null,
              meta: (a.meta as Record<string, unknown>) ?? {},
              createdAt: new Date(a.created_at as string).getTime(),
            })),
        error: codes.error?.message ?? waitlist.error?.message ?? audit.error?.message ?? null,
      }));
    });
    return () => {
      active = false;
    };
  }, [isDemo, nonce]);

  const demoSeed = useMemo(
    () => (isDemo ? { codes: demoCodes(now), waitlist: demoWaitlist(now), audit: demoAudit(now), error: null } : null),
    // Seed once per mount; demo edits live in `demo`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDemo],
  );
  const data: Snapshot = isDemo ? (demo ?? demoSeed ?? EMPTY) : (snap ?? EMPTY);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const createCode = useCallback(
    async (input: NewCodeInput): Promise<AccessCode> => {
      if (isDemo) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const pick = () => alphabet[Math.floor(Math.random() * alphabet.length)];
        const generated = `${Array.from({ length: 4 }, pick).join('')}-${Array.from({ length: 4 }, pick).join('')}`;
        const c: AccessCode = {
          id: `demo-${Date.now()}`,
          code: (input.code?.trim().toUpperCase() || generated),
          label: input.label,
          role: input.role,
          maxUses: input.seats,
          uses: 0,
          expiresAt: input.expiresAt,
          revokedAt: null,
          createdAt: Date.now(),
          redemptions: [],
        };
        setDemo((prev) => ({ ...(prev ?? demoSeed ?? EMPTY), codes: [c, ...(prev ?? demoSeed ?? EMPTY).codes] }));
        return c;
      }
      const { data: row, error } = await supabase.rpc('create_access_code', {
        p_label: input.label,
        p_role: input.role,
        p_max_uses: input.seats,
        p_expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
        p_code: input.code?.trim() ? input.code.trim() : null,
      });
      if (error) throw new Error(error.message);
      refresh();
      return rowToCode({ ...(row as CodeRow), access_code_redemptions: [] });
    },
    [isDemo, demoSeed, refresh],
  );

  const revokeCode = useCallback(
    async (id: string) => {
      if (isDemo) {
        setDemo((prev) => {
          const base = prev ?? demoSeed ?? EMPTY;
          return { ...base, codes: base.codes.map((c) => (c.id === id ? { ...c, revokedAt: Date.now() } : c)) };
        });
        return;
      }
      const { error } = await supabase.rpc('revoke_access_code', { p_id: id });
      if (error) throw new Error(error.message);
      refresh();
    },
    [isDemo, demoSeed, refresh],
  );

  const dropRequest = useCallback(
    (id: string) =>
      (isDemo ? setDemo : setSnap)((prev) => {
        const base = prev ?? (isDemo ? demoSeed : null) ?? EMPTY;
        return { ...base, waitlist: base.waitlist.filter((w) => w.id !== id) };
      }),
    [isDemo, demoSeed],
  );

  const dismissRequest = useCallback(
    async (id: string) => {
      if (!isDemo) {
        const { data: rows, error } = await supabase.from('waitlist').update({ status: 'dismissed' }).eq('id', id).select('id');
        if (error) throw new Error(error.message);
        if (!rows?.length) throw new Error('No change was saved — check that your account is still an administrator.');
      }
      dropRequest(id);
    },
    [isDemo, dropRequest],
  );

  const approveRequest = useCallback(
    async (id: string, role: CodeRole) => {
      if (!isDemo) {
        await apiFetch('/api/admin/members', { method: 'POST', json: { action: 'waitlist.approve', id, role } });
      }
      dropRequest(id);
      if (!isDemo) refresh();
    },
    [isDemo, dropRequest, refresh],
  );

  return {
    ...data,
    loading: !isDemo && snap === null,
    refresh,
    createCode,
    revokeCode,
    dismissRequest,
    approveRequest,
  };
}
