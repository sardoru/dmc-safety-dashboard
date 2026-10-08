import { cn } from '../../lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'subtle' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-ink shadow-sm hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-ink shadow-sm hover:border-line-strong hover:bg-surface-2',
  outline: 'border border-line-strong bg-transparent text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-3 hover:text-ink',
  subtle: 'bg-surface-3 text-ink hover:bg-line',
  danger: 'bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700',
  gold: 'bg-gold-400 text-navy-900 shadow-sm hover:bg-gold-300',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 gap-1 rounded-lg px-2.5 text-xs',
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-12 gap-2 rounded-xl px-5 text-[15px]',
  xl: 'h-14 gap-2.5 rounded-2xl px-6 text-base',
};

export function buttonClasses(opts: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string } = {}) {
  const { variant = 'primary', size = 'md', block, className } = opts;
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

export const ICON_BUTTON_SIZES = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-xl',
} as const;
