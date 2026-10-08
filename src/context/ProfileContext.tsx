import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { BusinessType, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { demoBusinessProfile } from '../data/demo';
import { useAuth } from './AuthContext';

interface ProfileContextType {
  /** The signed-in business user's storefront. */
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

const DEMO_KEY = 'dt-demo-business';

function loadDemoProfile(): UserProfile {
  try {
    const saved = localStorage.getItem(DEMO_KEY);
    if (saved) return JSON.parse(saved) as UserProfile;
  } catch {
    /* ignore */
  }
  return demoBusinessProfile();
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { configured, user, role } = useAuth();
  const [connectedProfile, setConnectedProfile] = useState<UserProfile | null>(null);
  const [demoProfile, setDemoProfile] = useState<UserProfile | null>(() => (configured ? null : loadDemoProfile()));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!configured || !user) return;
    let active = true;
    supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setConnectedProfile(data ? rowToProfile(data as BusinessRow) : null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [configured, user]);

  const setProfile = useCallback(
    async (p: UserProfile | null) => {
      if (!configured) {
        setDemoProfile(p);
        try {
          if (p) localStorage.setItem(DEMO_KEY, JSON.stringify(p));
          else localStorage.removeItem(DEMO_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      if (!user) return;
      if (!p) {
        await supabase.from('businesses').delete().eq('owner_id', user.id);
        setConnectedProfile(null);
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
      if (data) setConnectedProfile(rowToProfile(data as BusinessRow));
    },
    [configured, user],
  );

  // Only business accounts have a storefront; signed-out users have none.
  const profile = configured ? (user ? connectedProfile : null) : role === 'business' ? demoProfile : null;

  return (
    <ProfileContext.Provider value={{ profile, setProfile, isRegistered: Boolean(profile), loading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextType {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
