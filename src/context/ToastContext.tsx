import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../lib/format';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms; 0 = sticky. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastContextType {
  push: (t: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const TONE: Record<ToastTone, { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: 'text-navy-500 dark:text-gold-400' },
  success: { icon: CircleCheck, cls: 'text-emerald-600 dark:text-emerald-400' },
  warning: { icon: TriangleAlert, cls: 'text-amber-600 dark:text-amber-400' },
  danger: { icon: CircleAlert, cls: 'text-red-600 dark:text-red-400' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setItems((prev) => [...prev.slice(-3), { ...t, id }]);
      const duration = t.duration ?? (t.tone === 'danger' ? 9000 : 5500);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end"
      >
        {items.map((t) => {
          const tone = TONE[t.tone ?? 'info'];
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-pop"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', tone.cls)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] leading-snug text-muted">{t.body}</p>}
                {t.action && (
                  <button
                    onClick={() => {
                      t.action?.onClick();
                      dismiss(t.id);
                    }}
                    className="mt-2 text-[13px] font-semibold text-navy-600 hover:underline dark:text-gold-400"
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="-m-1 rounded-lg p-1 text-subtle hover:bg-surface-2 hover:text-ink"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
