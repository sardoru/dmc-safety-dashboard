import type { ReactNode } from 'react';
import { cn, initials } from '../../lib/format';

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs';
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center rounded-full bg-navy-600 font-bold tracking-wide text-gold-300 ring-2 ring-surface dark:bg-gold-400 dark:text-navy-900',
        s,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] font-semibold text-muted">
      {children}
    </kbd>
  );
}

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'accent';
  className?: string;
  pulse?: boolean;
}

const STAT_TONE = {
  default: 'text-ink',
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  accent: 'text-accent-strong',
} as const;

export function Stat({ label, value, hint, icon, tone = 'default', className, pulse }: StatProps) {
  return (
    <div className={cn('card relative overflow-hidden px-4 py-3.5', className)}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {icon && <span className="text-subtle">{icon}</span>}
        {label}
        {pulse && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-rose-500" aria-hidden />}
      </div>
      <p className={cn('mt-1 text-2xl font-bold leading-none tracking-tight tabular', STAT_TONE[tone])}>{value}</p>
      {hint && <p className="mt-1.5 truncate text-[12px] text-subtle">{hint}</p>}
    </div>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn('inline-block h-2 w-2 flex-shrink-0 rounded-full', className)} aria-hidden />;
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
    </span>
  );
}
