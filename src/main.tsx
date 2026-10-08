import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import ErrorBoundary from './components/ErrorBoundary';
import RequireAuth from './components/auth/RequireAuth';
import RequireRole from './components/auth/RequireRole';
import { LoadingScreen } from './components/auth/AuthStates';
import AppShell from './components/layout/AppShell';
import HomeGate from './components/auth/HomeGate';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ProfileProvider } from './context/ProfileContext';
import { ToastProvider } from './context/ToastContext';
import { IncidentProvider } from './context/IncidentContext';
import { BoloProvider } from './context/BoloContext';
import { VoiceProvider } from './context/VoiceContext';
import { RadioProvider } from './context/RadioContext';

// After a redeploy, an open tab may ask for chunk files that no longer exist.
// Reload once to pick up the new build instead of showing an error screen.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('dt-chunk-reload') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('dt-chunk-reload', String(Date.now()));
  } catch {
    /* storage unavailable: still try one reload */
  }
  event.preventDefault();
  window.location.reload();
});

const Landing = lazy(() => import('./pages/Landing'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const BusinessHome = lazy(() => import('./pages/BusinessHome'));
const ReportCenter = lazy(() => import('./pages/ReportCenter'));
const OpsCenter = lazy(() => import('./pages/OpsCenter'));
const BoloBoard = lazy(() => import('./pages/BoloBoard'));
const Insights = lazy(() => import('./pages/Insights'));
const AdminPortal = lazy(() => import('./pages/AdminPortal'));
const AccountPage = lazy(() => import('./pages/AccountPage'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>
              <ToastProvider>
                <IncidentProvider>
                  <BoloProvider>
                    <VoiceProvider>
                      <RadioProvider>
                        <Suspense fallback={<LoadingScreen />}>
                          <Routes>
                            <Route path="/" element={<HomeGate />} />
                            <Route path="/welcome" element={<Landing />} />
                            <Route path="/login" element={<LoginPage />} />
                            <Route path="/auth/callback" element={<AuthCallback />} />
                            <Route
                              element={
                                <RequireAuth>
                                  <AppShell />
                                </RequireAuth>
                              }
                            >
                              <Route
                                path="/home"
                                element={
                                  <RequireRole roles={['business']} redirect>
                                    <BusinessHome />
                                  </RequireRole>
                                }
                              />
                              <Route path="/report" element={<ReportCenter />} />
                              <Route path="/bolo" element={<BoloBoard />} />
                              <Route
                                path="/ops"
                                element={
                                  <RequireRole roles={['officer', 'admin']} redirect>
                                    <OpsCenter />
                                  </RequireRole>
                                }
                              />
                              <Route
                                path="/insights"
                                element={
                                  <RequireRole roles={['officer', 'admin']}>
                                    <Insights />
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
                              <Route path="/account" element={<AccountPage />} />
                            </Route>
                            {/* Earlier URLs */}
                            <Route path="/officer" element={<Navigate to="/report" replace />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                          </Routes>
                        </Suspense>
                      </RadioProvider>
                    </VoiceProvider>
                  </BoloProvider>
                </IncidentProvider>
              </ToastProvider>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
