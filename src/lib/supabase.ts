import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True only when real Supabase credentials are present. When false the app
 * runs in "demo mode": the dashboard works exactly as before (localStorage +
 * mock data) and the auth-gated portals show a "connect Supabase" notice.
 * This keeps the live deployment functional before env vars are pasted in.
 */
export const supabaseConfigured = Boolean(url && anonKey);

// A syntactically valid placeholder lets the SPA boot in demo mode without
// throwing inside createClient() when env vars are not yet set.
export const supabase: SupabaseClient = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'demo-anon-key-not-configured',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Magic links are verified explicitly on /auth/callback via verifyOtp,
      // so we don't need Supabase to auto-parse the URL on every page load.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

export const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');
