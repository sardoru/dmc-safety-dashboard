import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../hooks/useNow';
import { supabase } from '../../lib/supabase';
import {
  demoInvites,
  demoTeam,
  rowToInvite,
  rowToMember,
  sortMembers,
  type InviteRow,
  type MemberRow,
  type PendingInvite,
  type TeamMember,
} from './team';

export interface TeamState {
  members: TeamMember[];
  invites: PendingInvite[];
  /** The first load is still in flight (connected mode). */
  loading: boolean;
  /** A reload is in flight. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
  /** Drop a member / invite locally after a successful change. */
  dropMember: (id: string) => void;
  dropInvite: (id: string) => void;
}

interface Snapshot {
  nonce: number;
  members: TeamMember[];
  invites: PendingInvite[];
  error: string | null;
}

const NO_MEMBERS: TeamMember[] = [];
const NO_INVITES: PendingInvite[] = [];

/** Officers, administrators and pending invites — Supabase when connected, a sample team in demo mode. */
export function useTeam(): TeamState {
  const { isDemo } = useAuth();
  const now = useNow();
  const [nonce, setNonce] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    Promise.all([
      supabase
        .from('profiles')
        .select('id, email, role, display_name, created_at')
        .in('role', ['officer', 'admin'])
        .order('created_at', { ascending: true }),
      supabase
        .from('officer_invites')
        .select('id, email, role, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ])
      .then(([people, pending]) => {
        if (!active) return;
        setSnapshot((prev) => ({
          nonce,
          members: people.error
            ? (prev?.members ?? NO_MEMBERS)
            : sortMembers(((people.data ?? []) as MemberRow[]).map(rowToMember)),
          invites: pending.error
            ? (prev?.invites ?? NO_INVITES)
            : ((pending.data ?? []) as InviteRow[]).map(rowToInvite),
          error: people.error?.message ?? pending.error?.message ?? null,
        }));
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSnapshot((prev) => ({
          nonce,
          members: prev?.members ?? NO_MEMBERS,
          invites: prev?.invites ?? NO_INVITES,
          error: err instanceof Error ? err.message : 'Could not load the team.',
        }));
      });
    return () => {
      active = false;
    };
  }, [isDemo, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const dropMember = useCallback(
    (id: string) => setSnapshot((prev) => (prev ? { ...prev, members: prev.members.filter((m) => m.id !== id) } : prev)),
    [],
  );
  const dropInvite = useCallback(
    (id: string) => setSnapshot((prev) => (prev ? { ...prev, invites: prev.invites.filter((i) => i.id !== id) } : prev)),
    [],
  );

  const demo = useMemo(() => (isDemo ? { members: demoTeam(now), invites: demoInvites(now) } : null), [isDemo, now]);

  if (demo) {
    return { ...demo, loading: false, refreshing: false, error: null, refresh, dropMember, dropInvite };
  }
  return {
    members: snapshot?.members ?? NO_MEMBERS,
    invites: snapshot?.invites ?? NO_INVITES,
    loading: snapshot === null,
    refreshing: snapshot !== null && snapshot.nonce !== nonce,
    error: snapshot?.error ?? null,
    refresh,
    dropMember,
    dropInvite,
  };
}
