import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';
import { homePathFor } from '../layout/nav';
import { UnauthorizedNotice } from './AuthStates';

/** Inside the signed-in shell: limit a page to some roles. */
export default function RequireRole({
  roles,
  children,
  redirect,
}: {
  roles: Role[];
  children: ReactNode;
  /** Send other roles to their home instead of showing a notice. */
  redirect?: boolean;
}) {
  const { role } = useAuth();
  if (role && roles.includes(role)) return <>{children}</>;
  if (redirect) return <Navigate to={homePathFor(role)} replace />;
  return <UnauthorizedNotice />;
}
