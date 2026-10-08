import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingScreen } from './AuthStates';

/**
 * Gate signed-in areas. Connected: a Supabase session. Demo: a demo role
 * picked on the welcome page.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isDemo, loading, signedIn } = useAuth();
  const location = useLocation();

  if (!isDemo && loading) return <LoadingScreen />;
  if (!signedIn) {
    return <Navigate to={isDemo ? '/welcome' : '/login'} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
