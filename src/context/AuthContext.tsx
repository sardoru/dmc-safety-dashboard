import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, SITE_URL } from '../lib/supabase';
import { DEMO_PERSONAS } from '../data/demo';
import { clearSignedPhotoUrls } from '../lib/media';
import type { Profile, Role } from '../types';

interface AuthContextType {
  /** Real Supabase credentials are configured (vs. demo mode). */
  configured: boolean;
  isDemo: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  /** Signed in (connected) or a demo role picked (demo). */
  signedIn: boolean;
  /** Stable id for the acting user (Supabase uid or a demo persona id). */
  userId: string | null;
  displayName: string;
  email: string | null;
  isOfficer: boolean;
  isAdmin: boolean;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Demo mode only: act as a business / officer / admin (null = signed out). */
  setDemoRole: (role: Role | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);
const DEMO_ROLE_KEY = 'dt-demo-role';

/** Resolves null when the row doesn't exist; throws when the read fails. */
async function fetchProfile(userId: string): Promise<Profile | null> {
  // The handle_new_user trigger creates the profile row; retry briefly in case
  // of a first-login race.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, role, display_name')
      .eq('id', userId)
      .maybeSingle();
    if (data) return data as Profile;
    if (error && error.code !== 'PGRST116') throw error;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

function sameProfile(a: Profile | null, b: Profile | null): boolean {
  return a === b || (!!a && !!b && a.id === b.id && a.email === b.email && a.role === b.role && a.display_name === b.display_name);
}

function readDemoRole(): Role | null {
  try {
    const v = localStorage.getItem(DEMO_ROLE_KEY);
    return v === 'business' || v === 'officer' || v === 'admin' ? v : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Kept separate from `session` so it only changes when the account does:
  // auth-js re-emits SIGNED_IN with a fresh session object every time the tab
  // becomes visible, and everything keyed on `user` would reload.
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseConfigured);
  const [demoRole, setDemoRoleState] = useState<Role | null>(() => (supabaseConfigured ? null : readDemoRole()));
  const mounted = useRef(true);

  const applySession = useCallback((s: Session | null) => {
    setSession(s);
    const next = s?.user ?? null;
    setUser((prev) => (prev && next && prev.id === next.id && prev.email === next.email ? prev : next));
  }, []);

  const loadProfile = useCallback(async (s: Session | null) => {
    const uid = s?.user?.id;
    if (!uid) {
      setProfile(null);
      return;
    }
    try {
      const p = await fetchProfile(uid);
      if (mounted.current) setProfile((prev) => (sameProfile(prev, p) ? prev : p));
    } catch (err) {
      // A failed refresh (e.g. Wi-Fi still waking up) keeps the profile we
      // already have for this account instead of dropping the user's role.
      console.warn('[auth] profile refresh failed', err);
      if (mounted.current) setProfile((prev) => (prev?.id === uid ? prev : null));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted.current) return;
      applySession(data.session);
      await loadProfile(data.session);
      if (mounted.current) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') clearSignedPhotoUrls();
      applySession(s);
      void loadProfile(s);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession, loadProfile]);

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${SITE_URL}/auth/callback`, shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const setDemoRole = useCallback((role: Role | null) => {
    setDemoRoleState(role);
    try {
      if (role) localStorage.setItem(DEMO_ROLE_KEY, role);
      else localStorage.removeItem(DEMO_ROLE_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured) {
      setDemoRole(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, [setDemoRole]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const isDemo = !supabaseConfigured;
  const role: Role | null = isDemo ? demoRole : (profile?.role ?? null);
  const persona = isDemo && demoRole ? DEMO_PERSONAS[demoRole] : null;
  const email = persona?.email ?? user?.email ?? null;
  const displayName =
    persona?.name ?? (profile?.display_name || (email ? email.split('@')[0] : '') || 'Account');

  return (
    <AuthContext.Provider
      value={{
        configured: supabaseConfigured,
        isDemo,
        loading,
        session,
        user,
        profile,
        role,
        signedIn: isDemo ? Boolean(demoRole) : Boolean(session),
        userId: persona?.id ?? user?.id ?? null,
        displayName,
        email,
        isOfficer: role === 'officer' || role === 'admin',
        isAdmin: role === 'admin',
        sendMagicLink,
        signOut,
        refreshProfile,
        setDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
