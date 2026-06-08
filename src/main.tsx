import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import RequireAuth from './components/auth/RequireAuth';
import RequireRole from './components/auth/RequireRole';
import { LoadingScreen } from './components/auth/AuthStates';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import { AlertProvider } from './context/AlertContext';
import { RadioProvider } from './context/RadioContext';

const App = lazy(() => import('./App'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const OfficerPortal = lazy(() => import('./pages/OfficerPortal'));
const AdminPortal = lazy(() => import('./pages/AdminPortal'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ProfileProvider>
            <AlertProvider>
              <RadioProvider>
                <Suspense fallback={<LoadingScreen />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route
                      path="/account"
                      element={
                        <RequireAuth>
                          <AccountPage />
                        </RequireAuth>
                      }
                    />
                    <Route
                      path="/officer"
                      element={
                        <RequireRole roles={['officer', 'admin']}>
                          <OfficerPortal />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <RequireRole roles={['admin']}>
                          <AdminPortal />
                        </RequireRole>
                      }
                    />
                    {/* Public dashboard — open to everyone (anonymous + signed-in).
                        Auth only gates /account, /officer, /admin. */}
                    <Route path="/" element={<App />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </RadioProvider>
            </AlertProvider>
          </ProfileProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
