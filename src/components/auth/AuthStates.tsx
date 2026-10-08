import { LoaderCircle, ShieldAlert } from 'lucide-react';
import { LogoMark } from '../brand/Logo';
import { ButtonLink } from '../ui/Button';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg text-muted">
      <LogoMark className="h-12 w-12" />
      <p className="inline-flex items-center gap-2 text-sm">
        <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-hidden />
        {label}
      </p>
    </div>
  );
}

export function UnauthorizedNotice() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold text-ink">Officer access required</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This area is limited to Downtown public-safety officers. If you were invited, sign out and back in to refresh your
        permissions, or ask an administrator to invite your email.
      </p>
      <ButtonLink to="/" variant="secondary" className="mt-6">
        Back to your dashboard
      </ButtonLink>
    </div>
  );
}
