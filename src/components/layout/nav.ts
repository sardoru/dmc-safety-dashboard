import type { LucideIcon } from 'lucide-react';
import { ChartColumn, House, MonitorDot, ScanEye, Settings, ShieldCheck, SquarePen } from 'lucide-react';
import type { Role } from '../../types';

export interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: LucideIcon;
  roles: Role[];
  /** Shown as the prominent action in the nav. */
  primary?: boolean;
}

export const NAV: NavItem[] = [
  { to: '/home', label: 'Home', short: 'Home', icon: House, roles: ['business'] },
  { to: '/ops', label: 'Operations Center', short: 'Ops', icon: MonitorDot, roles: ['officer', 'admin'] },
  { to: '/report', label: 'Report an incident', short: 'Report', icon: SquarePen, roles: ['business', 'officer', 'admin'], primary: true },
  { to: '/bolo', label: 'Lookout board', short: 'Lookout', icon: ScanEye, roles: ['business', 'officer', 'admin'] },
  { to: '/insights', label: 'Insights', short: 'Insights', icon: ChartColumn, roles: ['officer', 'admin'] },
  { to: '/admin', label: 'Administration', short: 'Admin', icon: ShieldCheck, roles: ['admin'] },
  { to: '/account', label: 'Settings', short: 'Settings', icon: Settings, roles: ['business', 'officer', 'admin'] },
];

export function navFor(role: Role | null): NavItem[] {
  return role ? NAV.filter((n) => n.roles.includes(role)) : [];
}

export function homePathFor(role: Role | null): string {
  if (role === 'officer' || role === 'admin') return '/ops';
  if (role === 'business') return '/home';
  return '/';
}

export const ROLE_LABEL: Record<Role, string> = {
  business: 'Business',
  officer: 'Public Safety',
  admin: 'Administrator',
};
