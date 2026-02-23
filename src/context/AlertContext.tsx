import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Alert, AlertStatus, IncidentType } from '../types';
import { mockAlerts } from '../data/mockAlerts';
import { generateId, playAlertSound, sendNotification, getDistanceInMiles } from '../utils/helpers';
import { useProfile } from './ProfileContext';

interface AlertContextType {
  alerts: Alert[];
  activeAlerts: Alert[];
  last24hCount: number;
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'status' | 'acknowledgedBy'>) => void;
  updateAlertStatus: (id: string, status: AlertStatus) => void;
  acknowledgeAlert: (alertId: string, businessId: string) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

function loadAlerts(): Alert[] {
  try {
    const saved = localStorage.getItem('dmc-alerts');
    return saved ? JSON.parse(saved) : mockAlerts;
  } catch {
    return mockAlerts;
  }
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>(loadAlerts);
  const { profile } = useProfile();

  useEffect(() => {
    localStorage.setItem('dmc-alerts', JSON.stringify(alerts));
  }, [alerts]);

  // Auto-resolve alerts after 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const thirtyMinAgo = Date.now() - 30 * 60_000;
      setAlerts(prev =>
        prev.map(a =>
          a.status === 'active' && a.timestamp < thirtyMinAgo
            ? { ...a, status: 'resolved' as AlertStatus }
            : a
        )
      );
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const last24hCount = alerts.filter(a => a.timestamp > Date.now() - 86_400_000).length;

  const addAlert = useCallback((alertData: Omit<Alert, 'id' | 'timestamp' | 'status' | 'acknowledgedBy'>) => {
    const newAlert: Alert = {
      ...alertData,
      id: generateId(),
      timestamp: Date.now(),
      status: 'active',
      acknowledgedBy: [],
    };
    setAlerts(prev => [newAlert, ...prev]);
    playAlertSound();

    if (profile) {
      const distance = getDistanceInMiles(profile.lat, profile.lng, newAlert.lat, newAlert.lng);
      if (distance <= 0.5) {
        sendNotification(
          `${newAlert.incidentType} Alert`,
          `${newAlert.businessName} — ${(distance * 5280).toFixed(0)}ft away`
        );
      }
    }
  }, [profile]);

  const updateAlertStatus = useCallback((id: string, status: AlertStatus) => {
    setAlerts(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
  }, []);

  const acknowledgeAlert = useCallback((alertId: string, businessId: string) => {
    setAlerts(prev =>
      prev.map(a =>
        a.id === alertId && !a.acknowledgedBy.includes(businessId)
          ? { ...a, acknowledgedBy: [...a.acknowledgedBy, businessId], status: 'acknowledged' as AlertStatus }
          : a
      )
    );
  }, []);

  return (
    <AlertContext.Provider value={{ alerts, activeAlerts, last24hCount, addAlert, updateAlertStatus, acknowledgeAlert }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts(): AlertContextType {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertProvider');
  return ctx;
}
