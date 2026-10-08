import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bolo, BoloStatus, Incident, NewBoloInput } from '../types';
import { supabase } from '../lib/supabase';
import { rowToBolo, type BoloRow } from '../lib/incidentRows';
import { generateId } from '../lib/format';
import { buildDemoData } from '../data/demo';
import { useNow } from '../hooks/useNow';
import { useAuth } from './AuthContext';
import { useIncidents } from './IncidentContext';
import { useProfile } from './ProfileContext';

interface SightingInput {
  address: string;
  lat: number;
  lng: number;
  note?: string;
}

interface BoloContextType {
  bolos: Bolo[];
  activeBolos: Bolo[];
  /** The board exists (demo, or migration 0002 applied). */
  available: boolean;
  loading: boolean;
  createBolo: (input: NewBoloInput) => Promise<Bolo>;
  setBoloStatus: (id: string, status: BoloStatus) => Promise<void>;
  extendBolo: (id: string, days: number) => Promise<void>;
  reportSighting: (bolo: Bolo, input: SightingInput) => Promise<Incident>;
}

const BoloContext = createContext<BoloContextType | null>(null);
const DEMO_KEY = 'dt-demo-bolos-v2';
const EMPTY: Bolo[] = [];
let channelSeq = 0;

function loadDemo(): Bolo[] {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { bolos: Bolo[]; savedAt: number };
      if (Date.now() - parsed.savedAt < 12 * 3_600_000) return parsed.bolos;
    }
  } catch {
    /* ignore */
  }
  return buildDemoData().bolos;
}

function sortBolos(list: Bolo[]): Bolo[] {
  return [...list].sort((a, b) => (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt));
}

export function BoloProvider({ children }: { children: ReactNode }) {
  const { configured, user, userId, displayName, role } = useAuth();
  const { caps, createIncident, subscribe } = useIncidents();
  const { profile } = useProfile();
  const demo = !configured;

  const [bolos, setBolos] = useState<Bolo[]>(() => (demo ? sortBolos(loadDemo()) : []));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const bolosRef = useRef(bolos);
  useEffect(() => {
    bolosRef.current = bolos;
  }, [bolos]);

  useEffect(() => {
    if (!demo) return;
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify({ bolos, savedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [demo, bolos]);

  useEffect(() => {
    if (demo || !user || !caps.bolos) return;
    let active = true;
    supabase
      .from('bolos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!active) return;
        setBolos(sortBolos(((data ?? []) as BoloRow[]).map(rowToBolo)));
        setLoadedFor(user.id);
      });
    const channel = supabase
      .channel(`bolos-${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bolos' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setBolos((prev) => prev.filter((b) => b.id !== id));
          return;
        }
        const b = rowToBolo(payload.new as BoloRow);
        setBolos((prev) => sortBolos([b, ...prev.filter((x) => x.id !== b.id)]));
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [demo, user, caps.bolos]);

  // Demo: a sighting report bumps its BOLO (the database trigger does this when connected).
  useEffect(() => {
    if (!demo) return;
    return subscribe((ev) => {
      if (ev.type !== 'created' || !ev.incident.boloId) return;
      const inc = ev.incident;
      setBolos((prev) =>
        sortBolos(
          prev.map((b) =>
            b.id === inc.boloId
              ? {
                  ...b,
                  sightings: b.sightings + 1,
                  lastSeenAt: inc.occurredAt,
                  lastSeenLocation: inc.address,
                  lastSeenLat: inc.lat,
                  lastSeenLng: inc.lng,
                  incidentIds: b.incidentIds.includes(inc.id) ? b.incidentIds : [...b.incidentIds, inc.id],
                }
              : b,
          ),
        ),
      );
    });
  }, [demo, subscribe]);

  const createBolo = useCallback(
    async (input: NewBoloInput): Promise<Bolo> => {
      const now = Date.now();
      const expiresAt = now + (input.expiresInDays ?? 7) * 86_400_000;
      if (demo) {
        const b: Bolo = {
          id: `demo-bolo-${generateId()}`,
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          subject: input.subject,
          vehicle: input.vehicle,
          photo: input.photo,
          incidentIds: input.incidentIds ?? [],
          status: 'active',
          createdBy: userId ?? undefined,
          createdByName: displayName,
          createdAt: now,
          expiresAt,
          lastSeenAt: input.lastSeenAt,
          lastSeenLocation: input.lastSeenLocation,
          lastSeenLat: input.lastSeenLat,
          lastSeenLng: input.lastSeenLng,
          sightings: 0,
        };
        setBolos((prev) => sortBolos([b, ...prev]));
        return b;
      }
      if (!caps.bolos) throw new Error('The BOLO board needs database migration 0002.');
      const { data, error } = await supabase
        .from('bolos')
        .insert({
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          subject: input.subject ?? null,
          vehicle: input.vehicle ?? null,
          photo_path: input.photo ?? null,
          report_ids: input.incidentIds ?? [],
          created_by: userId,
          created_by_name: displayName,
          expires_at: new Date(expiresAt).toISOString(),
          last_seen_at: input.lastSeenAt ? new Date(input.lastSeenAt).toISOString() : null,
          last_seen_location: input.lastSeenLocation ?? null,
          last_seen_lat: input.lastSeenLat ?? null,
          last_seen_lng: input.lastSeenLng ?? null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const b = rowToBolo(data as BoloRow);
      setBolos((prev) => sortBolos([b, ...prev.filter((x) => x.id !== b.id)]));
      return b;
    },
    [demo, caps.bolos, userId, displayName],
  );

  const patch = useCallback(
    async (id: string, local: Partial<Bolo>, row: Record<string, unknown>) => {
      const before = bolosRef.current.find((b) => b.id === id);
      setBolos((prev) => prev.map((b) => (b.id === id ? { ...b, ...local } : b)));
      if (demo) return;
      const { error } = await supabase.from('bolos').update(row).eq('id', id);
      if (error) {
        if (before) setBolos((prev) => prev.map((b) => (b.id === id ? before : b)));
        throw new Error(error.message);
      }
    },
    [demo],
  );

  const setBoloStatus = useCallback(
    (id: string, status: BoloStatus) => patch(id, { status }, { status }),
    [patch],
  );

  const extendBolo = useCallback(
    async (id: string, days: number) => {
      const b = bolosRef.current.find((x) => x.id === id);
      if (!b) return;
      const expiresAt = Math.max(Date.now(), b.expiresAt) + days * 86_400_000;
      await patch(id, { expiresAt, status: 'active' }, { expires_at: new Date(expiresAt).toISOString(), status: 'active' });
    },
    [patch],
  );

  const reportSighting = useCallback(
    async (bolo: Bolo, input: SightingInput) => {
      const officer = role === 'officer' || role === 'admin';
      return createIncident({
        source: officer ? 'officer' : 'business',
        kind: 'quick',
        category: bolo.kind === 'vehicle' ? 'suspicious_vehicle' : 'suspicious_person',
        priority: 2,
        title: `Sighting: ${bolo.title}`.slice(0, 90),
        description: input.note?.trim()
          ? `Possible sighting of the BOLO subject. ${input.note.trim()}`
          : 'Possible sighting of the BOLO subject.',
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        happeningNow: true,
        subjects: bolo.subject ? [{ ...bolo.subject, id: generateId() }] : [],
        vehicles: bolo.vehicle ? [{ ...bolo.vehicle, id: generateId() }] : [],
        reporterName: officer ? displayName : (profile?.businessName ?? displayName),
        businessId: officer ? undefined : profile?.id,
        contactPhone: profile?.phone,
        boloId: bolo.id,
        visibility: 'officers',
      });
    },
    [createIncident, role, displayName, profile],
  );

  const visible = demo || user ? bolos : EMPTY;
  const now = useNow();
  const activeBolos = useMemo(
    () => visible.filter((b) => b.status === 'active' && b.expiresAt > now),
    [visible, now],
  );

  const value: BoloContextType = {
    bolos: visible,
    activeBolos,
    available: demo || caps.bolos,
    loading: !demo && Boolean(user) && caps.bolos && loadedFor !== user?.id,
    createBolo,
    setBoloStatus,
    extendBolo,
    reportSighting,
  };

  return <BoloContext.Provider value={value}>{children}</BoloContext.Provider>;
}

export function useBolos(): BoloContextType {
  const ctx = useContext(BoloContext);
  if (!ctx) throw new Error('useBolos must be used within BoloProvider');
  return ctx;
}
