import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingScreen } from './AuthStates';

/**
 * Gate a route behind authentication. In demo mode (no Supabase) the children
 * render so the public dashboard keeps working before env vars are set.
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth();
  const location = useLocation();

  if (!configured) return <>{children}</>;
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
