import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';
import { LoadingScreen, NotConfiguredNotice, UnauthorizedNotice } from './AuthStates';

export default function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { configured, loading, session, role } = useAuth();
  const location = useLocation();

  if (!configured) return <NotConfiguredNotice />;
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!role || !roles.includes(role)) return <UnauthorizedNotice />;
  return <>{children}</>;
}
