import { BadgeCheck, ShieldCheck, Store } from 'lucide-react';
import type { Role } from '../../types';
import { cn } from '../../lib/format';
import { ROLE_LABEL } from '../layout/nav';

const ROLE_STYLE: Record<Role, string> = {
  admin: 'bg-accent-soft text-accent-strong ring-accent/30',
  officer:
    'bg-navy-50 text-navy-600 ring-navy-500/20 dark:bg-navy-400/15 dark:text-navy-100 dark:ring-navy-300/25',
  business: 'bg-surface-3 text-ink-2 ring-line-strong',
};

const ROLE_ICON = { admin: ShieldCheck, officer: BadgeCheck, business: Store } as const;

/** Small pill naming an account's role ("Administrator", "Public Safety", "Business"). */
export default function RoleChip({ role, className }: { role: Role; className?: string }) {
  const Icon = ROLE_ICON[role];
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        ROLE_STYLE[role],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {ROLE_LABEL[role]}
    </span>
  );
}
