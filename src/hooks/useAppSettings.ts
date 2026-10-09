import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

export type SignupMode = 'open' | 'invite';

export interface AppSettings {
  /** open: anyone can create an account; invite: an access code or invitation is required. */
  signupMode: SignupMode;
  /** The public live map at /live. */
  publicMapEnabled: boolean;
  /** Reports appear on the public map only after this many minutes. */
  publicMapDelayMinutes: number;
}

export const DEFAULT_SETTINGS: AppSettings = { signupMode: 'open', publicMapEnabled: true, publicMapDelayMinutes: 0 };

interface Row {
  signup_mode: SignupMode;
  public_map_enabled: boolean;
  public_map_delay_minutes: number;
}

const fromRow = (r: Row): AppSettings => ({
  signupMode: r.signup_mode === 'invite' ? 'invite' : 'open',
  publicMapEnabled: r.public_map_enabled,
  publicMapDelayMinutes: r.public_map_delay_minutes,
});

// Demo mode keeps settings in memory for the session.
let demoSettings: AppSettings = { ...DEFAULT_SETTINGS };

/** Site-wide settings: readable by everyone (RLS), saved by administrators. */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => (supabaseConfigured ? DEFAULT_SETTINGS : demoSettings));
  const [loaded, setLoaded] = useState(!supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    let active = true;
    supabase
      .from('app_settings')
      .select('signup_mode, public_map_enabled, public_map_delay_minutes')
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!active) return;
        // Before migration 0004 the table doesn't exist: keep the defaults.
        if (data) setSettings(fromRow(data as Row));
        setError(e && e.code !== '42P01' && e.code !== 'PGRST205' ? e.message : null);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (patch: Partial<AppSettings>) => {
    if (!supabaseConfigured) {
      demoSettings = { ...demoSettings, ...patch };
      setSettings(demoSettings);
      return;
    }
    const row: Partial<Row> = {};
    if (patch.signupMode) row.signup_mode = patch.signupMode;
    if (patch.publicMapEnabled !== undefined) row.public_map_enabled = patch.publicMapEnabled;
    if (patch.publicMapDelayMinutes !== undefined) row.public_map_delay_minutes = patch.publicMapDelayMinutes;
    const { data, error: e } = await supabase
      .from('app_settings')
      .update(row)
      .eq('id', true)
      .select('signup_mode, public_map_enabled, public_map_delay_minutes');
    if (e) throw new Error(e.message);
    // Row-level security turns a non-admin update into a silent no-op.
    if (!data?.length) throw new Error('No change was saved — check that your account is still an administrator.');
    setSettings(fromRow(data[0] as Row));
  }, []);

  return { settings, loaded, error, save };
}
