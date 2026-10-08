import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
}

export function Card({ padded = true, as: Tag = 'section', className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn('card', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </Tag>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** No bottom margin (header is the whole card). */
  flush?: boolean;
}

export function CardHeader({ title, subtitle, icon, action, className, flush }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3', !flush && 'mb-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

interface SectionTitleProps {
  children: ReactNode;
  action?: ReactNode;
  count?: number;
  className?: string;
}

export function SectionTitle({ children, action, count, className }: SectionTitleProps) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted tabular">{count}</span>
        )}
      </h2>
      {action}
    </div>
  );
}
