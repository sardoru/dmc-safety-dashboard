import type { Role } from '../../types';
import { DEMO_PERSONAS } from '../../data/demo';

export type StaffRole = Exclude<Role, 'business'>;

/** An officer or administrator (a `profiles` row with a staff role). */
export interface TeamMember {
  id: string;
  email: string | null;
  role: StaffRole;
  displayName: string | null;
  joinedAt: number | null;
}

/** A pending `officer_invites` row. */
export interface PendingInvite {
  id: string;
  email: string;
  role: StaffRole;
  invitedAt: number;
}

export interface MemberRow {
  id: string;
  email: string | null;
  role: string;
  display_name: string | null;
  created_at: string | null;
}

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function toStaffRole(role: string): StaffRole {
  return role === 'admin' ? 'admin' : 'officer';
}

function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function rowToMember(row: MemberRow): TeamMember {
  return {
    id: row.id,
    email: row.email,
    role: toStaffRole(row.role),
    displayName: row.display_name,
    joinedAt: toTime(row.created_at),
  };
}

export function rowToInvite(row: InviteRow): PendingInvite {
  return { id: row.id, email: row.email, role: toStaffRole(row.role), invitedAt: toTime(row.created_at) ?? 0 };
}

export function memberName(m: Pick<TeamMember, 'displayName' | 'email'>): string {
  return m.displayName?.trim() || m.email?.split('@')[0] || 'Team member';
}

/** Administrators first, then alphabetical. */
export function sortMembers(list: TeamMember[]): TeamMember[] {
  return [...list].sort((a, b) =>
    a.role === b.role ? memberName(a).localeCompare(memberName(b)) : a.role === 'admin' ? -1 : 1,
  );
}

export function staffRoleNoun(role: StaffRole): string {
  return role === 'admin' ? 'an administrator' : 'a Public Safety officer';
}

export const STAFF_ROLE_HINT: Record<StaffRole, string> = {
  officer: 'Monitors and works reports, the lookout board and insights.',
  admin: 'Everything an officer can do, plus managing the team and system settings.',
};

/** Demo mode: the sample team (the demo personas plus one more officer). */
export function demoTeam(now: number): TeamMember[] {
  return sortMembers([
    {
      id: DEMO_PERSONAS.admin.id,
      email: DEMO_PERSONAS.admin.email,
      role: 'admin',
      displayName: DEMO_PERSONAS.admin.name,
      joinedAt: now - 214 * DAY,
    },
    {
      id: DEMO_PERSONAS.officer.id,
      email: DEMO_PERSONAS.officer.email,
      role: 'officer',
      displayName: DEMO_PERSONAS.officer.name,
      joinedAt: now - 121 * DAY,
    },
    {
      id: 'demo-officer-morris',
      email: 'k.morris@downtownsafety.example',
      role: 'officer',
      displayName: 'Officer K. Morris',
      joinedAt: now - 38 * DAY,
    },
  ]);
}

export function demoInvites(now: number): PendingInvite[] {
  return [{ id: 'demo-invite-1', email: 'a.nguyen@downtownsafety.example', role: 'officer', invitedAt: now - 26 * HOUR }];
}
