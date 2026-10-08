import { Fragment, useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck, CircleDashed, CircleX, LoaderCircle, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/format';
import { Card } from '../ui/Card';
import type { EnvVar, Health, HealthState } from './systemHealth';

const HEALTH_STYLE: Record<HealthState, { icon: LucideIcon; cls: string }> = {
  ok: {
    icon: CircleCheck,
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  },
  warning: {
    icon: TriangleAlert,
    cls: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/25',
  },
  error: {
    icon: CircleX,
    cls: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/25',
  },
  info: { icon: CircleDashed, cls: 'bg-surface-3 text-ink-2 ring-line-strong' },
  checking: { icon: LoaderCircle, cls: 'bg-surface-3 text-muted ring-line' },
};

/** ✓ / ⚠ / ✗ status pill — the label always spells the state out. */
export function HealthBadge({ health, className }: { health: Health; className?: string }) {
  const style = HEALTH_STYLE[health.state];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold ring-1 ring-inset',
        style.cls,
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', health.state === 'checking' && 'animate-spin')} aria-hidden />
      {health.label}
    </span>
  );
}

/** Environment variables to set, with where they live. */
export function EnvList({ title, vars }: { title: string; vars: EnvVar[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">{title}</p>
      <ul className="space-y-1.5">
        {vars.map((v) => (
          <li key={v.name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <code className="rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] font-medium text-ink wrap-anywhere">
              {v.name}
            </code>
            <span className="text-[12px] text-muted">
              {[v.where === 'client' ? 'build-time' : 'server', v.optional ? 'optional' : null, v.note]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface DetailItem {
  label: string;
  value: ReactNode;
  mono?: boolean;
}

/** Label / value pairs (model, voice, project …). */
export function DetailList({ items }: { items: DetailItem[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
      {items.map((d) => (
        <Fragment key={d.label}>
          <dt className="text-muted">{d.label}</dt>
          <dd className={cn('min-w-0 text-ink wrap-anywhere', d.mono && 'font-mono text-[12px] leading-5')}>{d.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/** One line of a checklist: done, missing, or still checking (null). */
export function CheckItem({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  const Icon = ok === null ? LoaderCircle : ok ? CircleCheck : CircleX;
  return (
    <li className="flex items-start gap-2">
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 flex-shrink-0',
          ok === null && 'animate-spin text-subtle',
          ok === true && 'text-emerald-600 dark:text-emerald-400',
          ok === false && 'text-amber-600 dark:text-amber-400',
        )}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">
          {label}
          <span className="sr-only">: {ok === null ? 'checking' : ok ? 'applied' : 'missing'}</span>
        </span>
        {detail && <span className="block text-[12px] text-muted">{detail}</span>}
      </span>
    </li>
  );
}

interface IntegrationCardProps {
  icon: ReactNode;
  title: string;
  provider: string;
  health: Health;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** One integration on the System tab: what it is, whether it works, and what to set. */
export default function IntegrationCard({ icon, title, provider, health, children, footer, className }: IntegrationCardProps) {
  const headingId = useId();
  return (
    <Card className={cn('flex min-w-0 flex-col', className)} aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
            {icon}
          </span>
          <div className="min-w-0">
            <h3 id={headingId} className="text-[15px] font-semibold leading-tight text-ink">
              {title}
            </h3>
            <p className="mt-0.5 text-[12px] text-muted">{provider}</p>
          </div>
        </div>
        <HealthBadge health={health} />
      </div>
      <div className="mt-4 flex-1 space-y-3.5 text-[13px] leading-relaxed text-ink-2">{children}</div>
      {footer && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">{footer}</div>}
    </Card>
  );
}
