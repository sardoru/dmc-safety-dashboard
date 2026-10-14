import type { Role } from '../types';

/**
 * Public Safety access — the Operations Center, Insights, triage, BOLOs, spoken alerts: officers, DMC
 * (exactly an officer's access) and administrators. The database agrees: is_officer() (migration 0009).
 */
export function isStaff(role: Role | null | undefined): boolean {
  return role === 'officer' || role === 'dmc' || role === 'admin';
}
