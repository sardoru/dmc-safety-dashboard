import { useId } from 'react';
import { cn } from '../../lib/format';

/** The navy-and-gold shield mark (same artwork as the favicon). */
export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9 flex-shrink-0', className)} role="img" aria-label="Core Downtown Memphis Safety">
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#26406b" />
          <stop offset="1" stopColor="#111a33" />
        </linearGradient>
        <linearGradient id={`sh-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e7cd8c" />
          <stop offset="0.55" stopColor="#c5a55a" />
          <stop offset="1" stopColor="#b08e44" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#bg-${id})`} />
      <rect x="1.75" y="1.75" width="60.5" height="60.5" rx="13.25" fill="none" stroke="#c5a55a" strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M19 15.5 L45 15.5 Q47 15.5 47 18 L47 33 Q47 43.5 32 50.5 Q17 43.5 17 33 L17 18 Q17 15.5 19 15.5 Z" fill={`url(#sh-${id})`} />
      <path d="M24.5 32.6 L29.8 38 L40 26.4" fill="none" stroke="#13203a" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  /** Light text for dark/photo backgrounds. */
  inverse?: boolean;
  compact?: boolean;
}

export default function Logo({ className, inverse, compact }: LogoProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="min-w-0 leading-none">
          <span className={cn('block whitespace-nowrap text-[14px] font-bold tracking-tight', inverse ? 'text-white' : 'text-ink')}>
            Core Downtown Memphis
          </span>
          <span className={cn('mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.2em]', inverse ? 'text-gold-300' : 'text-accent-strong')}>
            Safety Dashboard
          </span>
        </span>
      )}
    </span>
  );
}
