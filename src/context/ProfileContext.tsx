import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { BusinessType, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface ProfileContextType {
  /** The current user's business, mapped to the dashboard's UserProfile shape. */
  profile: UserProfile | null;
  setProfile: (p: UserProfile | null) => Promise<void>;
  isRegistered: boolean;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

interface BusinessRow {
  id: string;
  name: string;
  address: string;
  type: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  lat: number;
  lng: number;
  created_at: string;
}

function rowToProfile(row: BusinessRow): UserProfile {
  return {
    id: row.id,
    businessName: row.name,
    address: row.address,
    businessType: (row.type as BusinessType) ?? 'other',
    contactName: row.contact_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    lat: row.lat,
    lng: row.lng,
    registeredAt: new Date(row.created_at).getTime(),
  };
}

function loadLocal(): UserProfile | null {
  try {
    const saved = localStorage.getItem('dmc-profile');
    return saved ? (JSON.parse(saved) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { configured, user } = useAuth();
  const [profile, setProfileState] = useState<UserProfile | null>(() =>
    configured ? null : loadLocal(),
  );
  const [loading, setLoading] = useState(false);

  // Load the authenticated user's business from Supabase.
  useEffect(() => {
    if (!configured) return;
    if (!user) {
      setProfileState(null);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfileState(data ? rowToProfile(data as BusinessRow) : null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [configured, user]);

  const setProfile = useCallback(
    async (p: UserProfile | null) => {
      // Demo mode: localStorage only.
      if (!configured) {
        setProfileState(p);
        if (p) localStorage.setItem('dmc-profile', JSON.stringify(p));
        else localStorage.removeItem('dmc-profile');
        return;
      }
      if (!user) return;

      if (!p) {
        await supabase.from('businesses').delete().eq('owner_id', user.id);
        setProfileState(null);
        return;
      }

      const { data, error } = await supabase
        .from('businesses')
        .upsert(
          {
            owner_id: user.id,
            name: p.businessName,
            address: p.address,
            type: p.businessType,
            contact_name: p.contactName,
            phone: p.phone,
            email: p.email,
            lat: p.lat,
            lng: p.lng,
          },
          { onConflict: 'owner_id' },
        )
        .select()
        .single();

      if (error) throw error;
      if (data) setProfileState(rowToProfile(data as BusinessRow));
    },
    [configured, user],
  );

  return (
    <ProfileContext.Provider value={{ profile, setProfile, isRegistered: !!profile, loading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextType {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
