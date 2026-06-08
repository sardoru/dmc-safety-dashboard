import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, SITE_URL } from '../lib/supabase';
import type { Profile, Role } from '../types';

interface AuthContextType {
  /** Whether real Supabase credentials are configured (vs. demo mode). */
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  isOfficer: boolean;
  isAdmin: boolean;
  /** Send a branded magic-link sign-in email. */
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

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
    if (error && error.code !== 'PGRST116') break;
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseConfigured);
  const mounted = useRef(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(s.user.id);
    if (mounted.current) setProfile(p);
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Demo mode: loading already initializes to false (supabaseConfigured).
    if (!supabaseConfigured) return;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted.current) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (mounted.current) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadProfile(s);
    });

    return () => {
      mounted.current = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const sendMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  const role = profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        configured: supabaseConfigured,
        loading,
        session,
        user: session?.user ?? null,
        profile,
        role,
        isOfficer: role === 'officer' || role === 'admin',
        isAdmin: role === 'admin',
        sendMagicLink,
        signOut,
        refreshProfile,
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
