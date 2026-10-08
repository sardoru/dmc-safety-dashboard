import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/format';
import { buttonClasses, ICON_BUTTON_SIZES, type ButtonSize, type ButtonVariant } from './styles';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, icon, iconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, block, className })}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export function ButtonLink({ variant, size, block, icon, iconRight, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: keyof typeof ICON_BUTTON_SIZES;
  variant?: 'ghost' | 'secondary' | 'subtle' | 'primary';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', active, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex flex-shrink-0 items-center justify-center transition-colors disabled:opacity-50',
        ICON_BUTTON_SIZES[size],
        variant === 'ghost' && 'text-muted hover:bg-surface-3 hover:text-ink',
        variant === 'secondary' && 'border border-line bg-surface text-ink-2 shadow-sm hover:bg-surface-2 hover:text-ink',
        variant === 'subtle' && 'bg-surface-3 text-ink-2 hover:bg-line hover:text-ink',
        variant === 'primary' && 'bg-primary text-primary-ink hover:bg-primary-hover',
        active && 'bg-accent-soft text-accent-strong hover:bg-accent-soft',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
