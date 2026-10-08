import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/format';

function useOverlay(open: boolean, onClose: () => void, panel: React.RefObject<HTMLDivElement | null>) {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel so screen readers land inside it.
    const t = window.setTimeout(() => panel.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      previouslyFocused?.focus?.();
    };
  }, [open, panel]);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const DIALOG_SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export function Dialog({ open, onClose, title, description, icon, children, footer, size = 'md' }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1500] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/55 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop outline-none sm:rounded-3xl',
          DIALOG_SIZES[size],
        )}
      >
        {(title || icon) && (
          <div className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
            {icon && (
              <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                {icon}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-lg font-semibold leading-tight text-ink">{title}</h2>}
              {description && <p className="mt-1 text-[13px] leading-snug text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className="-mr-1 rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-ink" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Panel width on desktop. */
  width?: string;
  label?: string;
}

/** Right-side drawer on desktop, bottom sheet on mobile. */
export function Sheet({ open, onClose, children, width = 'sm:max-w-xl', label }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[1400] flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/45 backdrop-blur-[1px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[94dvh] w-full animate-sheet-up flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-pop outline-none sm:max-h-none sm:animate-slide-in-right sm:rounded-none sm:rounded-l-3xl',
          width,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 flex-shrink-0 rounded-full bg-line-strong sm:hidden" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
