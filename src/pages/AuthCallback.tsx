import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { TriangleAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LoadingScreen } from '../components/auth/AuthStates';
import { LogoMark } from '../components/brand/Logo';
import { buttonClasses } from '../components/ui/styles';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const token_hash = params.get('token_hash');
      const type = (params.get('type') || 'magiclink') as EmailOtpType;
      // An administrator's "set up a passkey" link lands on the one-tap prompt.
      const setup = params.get('passkey') === 'setup';
      const next = setup ? '/account?passkey=setup' : '/';

      // Already have a session (e.g. link opened twice)? Go on. A setup link is
      // still verified first, so the passkey lands on the account it was sent to.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session && !(setup && token_hash)) {
        navigate(next, { replace: true });
        return;
      }

      if (!token_hash) {
        setError('This sign-in link is missing its security token. Please request a new one.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });
      if (verifyError && !existing.session) {
        setError(verifyError.message || 'This link is invalid or has expired.');
        return;
      }
      navigate(next, { replace: true });
    })();
  }, [params, navigate]);

  if (!error) return <LoadingScreen label="Signing you in…" />;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="card w-full max-w-md p-7 text-center">
        <LogoMark className="mx-auto mb-5 h-12 w-12" />
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
          <TriangleAlert className="h-5 w-5" />
        </span>
        <h1 className="text-lg font-bold text-ink">Sign-in link problem</h1>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <p className="mt-3 text-[13px] text-subtle">
          Magic links can only be used once and expire after an hour. Request a fresh link from the sign-in page.
        </p>
        <Link to="/login" className={buttonClasses({ className: 'mt-6' })}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
