import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { homePathFor } from '../layout/nav';
import { LoadingScreen } from './AuthStates';

const Landing = lazy(() => import('../../pages/Landing'));

/** `/`: signed-in users go to their workspace; everyone else sees the welcome page. */
export default function HomeGate() {
  const { isDemo, loading, signedIn, role } = useAuth();
  if (!isDemo && loading) return <LoadingScreen />;
  if (signedIn && role) return <Navigate to={homePathFor(role)} replace />;
  return <Landing />;
}
