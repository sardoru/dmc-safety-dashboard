import type { ReactNode } from 'react';
import { CircleAlert, Info, LoaderCircle, TriangleAlert, CircleCheck } from 'lucide-react';
import { cn } from '../../lib/format';
import BrandImage from '../brand/BrandImage';
import type { BrandImageName } from '../../lib/brand';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-muted', className)} role="status">
      <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode;
  illustration?: BrandImageName;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({ title, body, illustration, icon, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-8' : 'px-6 py-12', className)}>
      {illustration ? (
        <BrandImage
          name={illustration}
          width={compact ? 256 : 384}
          alt=""
          className={cn('mb-4 object-contain', compact ? 'h-28 w-28' : 'h-40 w-40')}
          fallback={icon ? <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">{icon}</span> : undefined}
        />
      ) : icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">{icon}</span>
      ) : null}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success';

const BANNER: Record<BannerTone, { cls: string; icon: typeof Info }> = {
  info: { cls: 'border-navy-200 bg-navy-50 text-navy-700 dark:border-navy-500/30 dark:bg-navy-500/10 dark:text-navy-100', icon: Info },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200', icon: TriangleAlert },
  danger: { cls: 'border-red-200 bg-red-50 text-red-800 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200', icon: CircleAlert },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200', icon: CircleCheck },
};

interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export function Banner({ tone = 'info', title, children, action, className, icon }: BannerProps) {
  const t = BANNER[tone];
  const Icon = t.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border px-4 py-3', t.cls, className)} role={tone === 'danger' ? 'alert' : undefined}>
      <span className="mt-0.5 flex-shrink-0">{icon ?? <Icon className="h-4.5 w-4.5" aria-hidden />}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5' : '', 'opacity-90')}>{children}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
