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

/** A pending `officer_invites` row — any role: admins, access codes and approved requests all create them. */
export interface PendingInvite {
  id: string;
  email: string;
  role: Role;
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

/** Any role from the database; an unexpected value is shown as the least-privileged one. */
function toRole(role: string): Role {
  return role === 'admin' || role === 'officer' ? role : 'business';
}

/** Higher outranks lower. Invitations only ever raise a role. */
export const ROLE_RANK: Record<Role, number> = { business: 1, officer: 2, admin: 3 };

/** The roles an admin can invite, least access first. */
export const INVITE_ROLES: { value: Role; label: string }[] = [
  { value: 'business', label: 'Member business' },
  { value: 'officer', label: 'Public Safety officer' },
  { value: 'admin', label: 'Administrator' },
];

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
  return { id: row.id, email: row.email, role: toRole(row.role), invitedAt: toTime(row.created_at) ?? 0 };
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

export function roleNoun(role: Role): string {
  return role === 'admin' ? 'an administrator' : role === 'officer' ? 'a Public Safety officer' : 'a member business';
}

/** What each role gets — shown under the role picker. */
export const ROLE_HINT: Record<Role, string> = {
  business: 'Reports incidents, follows their reports, and gets nearby alerts and the Lookout board.',
  officer: 'Works every report in the Operations Center, plus the Lookout board and Insights.',
  admin: 'Everything an officer can do, plus Team, Access, Businesses, Activity and System.',
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
  return [
    { id: 'demo-invite-2', email: 'hello@southmainbooks.example', role: 'business', invitedAt: now - 3 * HOUR },
    { id: 'demo-invite-1', email: 'a.nguyen@downtownsafety.example', role: 'officer', invitedAt: now - 26 * HOUR },
  ];
}
