import { useEffect, useState } from 'react';
import type { Business, BusinessType } from '../types';
import { mockBusinesses } from '../data/mockBusinesses';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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
}

function rowToBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    type: (row.type as BusinessType) ?? 'other',
    contactName: row.contact_name ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    lat: row.lat,
    lng: row.lng,
  };
}

// Unique per-subscription suffix. This hook renders in BOTH <Header> and
// <MapView>, so a fixed channel name ('public:businesses') collides — the
// second subscriber throws "cannot add postgres_changes callbacks ... after
// subscribe()", which (pre-ErrorBoundary) white-screened the whole app on login.
let channelSeq = 0;

/**
 * Registered businesses for the map/stats. Uses real Supabase rows when
 * connected (live-updating), and the demo set otherwise.
 */
export function useBusinesses(): Business[] {
  const { configured, user } = useAuth();
  const [list, setList] = useState<Business[]>(configured ? [] : mockBusinesses);

  useEffect(() => {
    if (!configured || !user) return;
    let active = true;

    const load = () =>
      supabase
        .from('businesses')
        .select('id, name, address, type, contact_name, phone, email, lat, lng')
        .then(({ data }) => {
          if (active && data) setList(data.map((r) => rowToBusiness(r as BusinessRow)));
        });

    void load();

    const channel = supabase
      .channel(`businesses-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () => {
        void load();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [configured, user]);

  return list;
}
