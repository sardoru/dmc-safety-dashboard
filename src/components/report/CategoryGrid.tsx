import type { CategoryKey } from '../../types';
import { CATEGORIES, CATEGORY_GROUPS } from '../../lib/taxonomy';
import { cn } from '../../lib/format';

interface CategoryGridProps {
  value: CategoryKey | null;
  onChange: (key: CategoryKey) => void;
  /** Hide the hint lines (compact quick-alert layout). */
  compact?: boolean;
}

export default function CategoryGrid({ value, onChange, compact }: CategoryGridProps) {
  return (
    <div className="space-y-4">
      {CATEGORY_GROUPS.map((g) => {
        const items = CATEGORIES.filter((c) => c.group === g.key);
        return (
          <div key={g.key}>
            <p className={cn('mb-2 text-[11px] font-semibold uppercase tracking-[0.14em]', g.key === 'emergency' ? 'text-red-600 dark:text-red-400' : 'text-subtle')}>
              {g.label}
            </p>
            <div className={cn('grid gap-2', compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3')}>
              {items.map((c) => {
                const Icon = c.icon;
                const active = value === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onChange(c.key)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-3 text-left transition-all',
                      active
                        ? g.key === 'emergency'
                          ? 'border-red-500 bg-red-50 ring-1 ring-red-500 dark:bg-red-500/10'
                          : 'border-accent bg-accent-soft/70 ring-1 ring-[var(--accent)]'
                        : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl',
                        g.key === 'emergency'
                          ? 'bg-red-50 text-red-600 dark:bg-red-500/12 dark:text-red-400'
                          : active
                            ? 'bg-primary text-primary-ink'
                            : 'bg-surface-3 text-ink-2',
                      )}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold leading-tight text-ink">{c.label}</span>
                      {!compact && <span className="mt-0.5 block text-[12px] leading-snug text-muted">{c.hint}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
