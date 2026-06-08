import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import AuthShell from '../components/auth/AuthShell';
import { LoadingScreen } from '../components/auth/AuthStates';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // Already have a session (e.g. link opened twice)? Go home.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) {
        navigate('/', { replace: true });
        return;
      }

      const token_hash = params.get('token_hash');
      const type = (params.get('type') || 'magiclink') as EmailOtpType;

      if (!token_hash) {
        setError('This sign-in link is missing its security token. Please request a new one.');
        return;
      }

      const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });
      if (verifyError) {
        setError(verifyError.message || 'This link is invalid or has expired.');
        return;
      }
      navigate('/', { replace: true });
    })();
  }, [params, navigate]);

  if (error) {
    return (
      <AuthShell
        title="Sign-in link problem"
        subtitle={error}
        footer={
          <a href="/login" className="hover:underline">
            Back to sign in
          </a>
        }
      >
        <div className="p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm">
          Magic links can only be used once and expire after an hour. Request a fresh link from the
          sign-in page.
        </div>
      </AuthShell>
    );
  }

  return <LoadingScreen label="Signing you in…" />;
}
