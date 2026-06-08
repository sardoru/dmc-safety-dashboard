import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Alert,
  AlertStatus,
  IncidentType,
  Report,
  ReportKind,
  ReportSource,
} from '../types';
import { mockAlerts } from '../data/mockAlerts';
import { generateId, playAlertSound, sendNotification, getDistanceInMiles } from '../utils/helpers';
import { useProfile } from './ProfileContext';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export interface NewReportInput {
  source: ReportSource;
  kind: ReportKind;
  incidentType: IncidentType;
  description: string;
  lat: number;
  lng: number;
  address?: string;
  transcript?: string;
  businessId?: string;
  businessName?: string;
}

interface AlertContextType {
  alerts: Alert[];
  activeAlerts: Alert[];
  last24hCount: number;
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'status' | 'acknowledgedBy'>) => Promise<void>;
  addReport: (input: NewReportInput) => Promise<void>;
  updateAlertStatus: (id: string, status: AlertStatus) => Promise<void>;
  acknowledgeAlert: (alertId: string, businessId: string) => Promise<void>;
  loading: boolean;
}

const AlertContext = createContext<AlertContextType | null>(null);

// Unique per-subscription suffix so a remount/StrictMode re-run never reuses an
// already-subscribed channel name (see useBusinesses for the failure mode).
let reportChannelSeq = 0;

function reportToAlert(r: Report): Alert {
  return {
    id: r.id,
    businessId: r.business_id || r.reporter_id || '',
    businessName: r.business_name || (r.source === 'officer' ? 'DMC Officer' : 'Downtown report'),
    address: r.address || '',
    incidentType: r.incident_type as IncidentType,
    description: r.description,
    timestamp: new Date(r.created_at).getTime(),
    status: r.status,
    lat: r.lat,
    lng: r.lng,
    acknowledgedBy: r.acknowledged_by || [],
  };
}

function loadLocalAlerts(): Alert[] {
  try {
    const saved = localStorage.getItem('dmc-alerts');
    return saved ? (JSON.parse(saved) as Alert[]) : mockAlerts;
  } catch {
    return mockAlerts;
  }
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { configured, user } = useAuth();
  const { profile } = useProfile();
  const [alerts, setAlerts] = useState<Alert[]>(() => (configured ? [] : loadLocalAlerts()));
  const [loading, setLoading] = useState<boolean>(configured);

  // Refs so the realtime handler can read latest profile/user without resubscribing.
  const profileRef = useRef(profile);
  const userRef = useRef(user);
  useEffect(() => {
    profileRef.current = profile;
    userRef.current = user;
  }, [profile, user]);

  // ── Demo mode (no Supabase): localStorage + auto-resolve, as before ──────────
  useEffect(() => {
    if (configured) return;
    localStorage.setItem('dmc-alerts', JSON.stringify(alerts));
  }, [alerts, configured]);

  useEffect(() => {
    if (configured) return;
    const interval = setInterval(() => {
      const thirtyMinAgo = Date.now() - 30 * 60_000;
      setAlerts((prev) =>
        prev.map((a) =>
          a.status === 'active' && a.timestamp < thirtyMinAgo
            ? { ...a, status: 'resolved' as AlertStatus }
            : a,
        ),
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, [configured]);

  // ── Connected mode: load reports + subscribe to realtime changes ─────────────
  useEffect(() => {
    if (!configured || !user) {
      if (configured) setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);

    supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!active) return;
        setAlerts((data ?? []).map((r) => reportToAlert(r as Report)));
        setLoading(false);
      });

    const channel = supabase
      .channel(`reports-${++reportChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Report;
            const alert = reportToAlert(row);
            setAlerts((prev) => (prev.some((a) => a.id === alert.id) ? prev : [alert, ...prev]));

            // Alert nearby businesses; don't ping the reporter for their own report.
            if (row.reporter_id !== userRef.current?.id) {
              playAlertSound();
              const me = profileRef.current;
              if (me) {
                const distance = getDistanceInMiles(me.lat, me.lng, alert.lat, alert.lng);
                if (distance <= 0.5) {
                  sendNotification(
                    `${alert.incidentType} Alert`,
                    `${alert.businessName} — ${(distance * 5280).toFixed(0)}ft away`,
                  );
                }
              }
            }
          } else if (payload.eventType === 'UPDATE') {
            const alert = reportToAlert(payload.new as Report);
            setAlerts((prev) => prev.map((a) => (a.id === alert.id ? alert : a)));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id: string }).id;
            setAlerts((prev) => prev.filter((a) => a.id !== oldId));
          }
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [configured, user]);

  const activeAlerts = alerts.filter((a) => a.status === 'active');
  const last24hCount = alerts.filter((a) => a.timestamp > Date.now() - 86_400_000).length;

  const addReport = useCallback(
    async (input: NewReportInput) => {
      if (!configured) {
        const alert: Alert = {
          id: generateId(),
          businessId: input.businessId || '',
          businessName:
            input.businessName || (input.source === 'officer' ? 'DMC Officer' : 'You'),
          address: input.address || '',
          incidentType: input.incidentType,
          description: input.description,
          timestamp: Date.now(),
          status: 'active',
          lat: input.lat,
          lng: input.lng,
          acknowledgedBy: [],
        };
        setAlerts((prev) => [alert, ...prev]);
        playAlertSound();
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({
          reporter_id: user?.id ?? null,
          source: input.source,
          kind: input.kind,
          incident_type: input.incidentType,
          description: input.description,
          transcript: input.transcript ?? null,
          business_id: input.businessId ?? null,
          business_name: input.businessName ?? null,
          address: input.address ?? null,
          lat: input.lat,
          lng: input.lng,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        const alert = reportToAlert(data as Report);
        setAlerts((prev) => (prev.some((a) => a.id === alert.id) ? prev : [alert, ...prev]));
      }
    },
    [configured, user],
  );

  const addAlert = useCallback(
    async (alertData: Omit<Alert, 'id' | 'timestamp' | 'status' | 'acknowledgedBy'>) => {
      await addReport({
        source: 'business',
        kind: 'incident',
        incidentType: alertData.incidentType,
        description: alertData.description,
        lat: alertData.lat,
        lng: alertData.lng,
        address: alertData.address,
        businessId: alertData.businessId,
        businessName: alertData.businessName,
      });
    },
    [addReport],
  );

  const updateAlertStatus = useCallback(
    async (id: string, status: AlertStatus) => {
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
      if (configured) {
        const { error } = await supabase.from('reports').update({ status }).eq('id', id);
        if (error) throw error;
      }
    },
    [configured],
  );

  const acknowledgeAlert = useCallback(
    async (alertId: string, businessId: string) => {
      let nextAck: string[] = [];
      setAlerts((prev) =>
        prev.map((a) => {
          if (a.id !== alertId) return a;
          nextAck = a.acknowledgedBy.includes(businessId)
            ? a.acknowledgedBy
            : [...a.acknowledgedBy, businessId];
          return { ...a, acknowledgedBy: nextAck, status: 'acknowledged' as AlertStatus };
        }),
      );
      if (configured) {
        const { error } = await supabase
          .from('reports')
          .update({ acknowledged_by: nextAck, status: 'acknowledged' })
          .eq('id', alertId);
        if (error) throw error;
      }
    },
    [configured],
  );

  return (
    <AlertContext.Provider
      value={{
        alerts,
        activeAlerts,
        last24hCount,
        addAlert,
        addReport,
        updateAlertStatus,
        acknowledgeAlert,
        loading,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertProvider');
  return ctx;
}
