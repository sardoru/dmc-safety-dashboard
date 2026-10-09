import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Incident, IncidentStatus, IncidentUpdate, NewIncidentInput, Priority, UpdateKind } from '../types';
import { supabase } from '../lib/supabase';
import {
  detectSchema,
  FULL_CAPS,
  hasCommunityReports,
  isSchemaError,
  UNCHECKED_CAPS,
  type SchemaCaps,
} from '../lib/schema';
import {
  COMMUNITY_REPORT_COLUMNS,
  communityRowToIncident,
  legacyStatus,
  newIncidentRow,
  rowToIncident,
  rowToUpdate,
  type CommunityReportRow,
  type ReportRow,
  type UpdateRow,
} from '../lib/incidentRows';
import { applyFeedChange, mergeFeeds, sortIncidents, type FeedChange } from '../lib/feed';
import { generateId, incidentRef } from '../lib/format';
import { photosToDataUrls, uploadReportPhotos } from '../lib/media';
import { categoryMeta, PRIORITIES, STATUSES } from '../lib/taxonomy';
import { buildDemoData, demoIncomingIncident } from '../data/demo';
import { bumpNow } from '../hooks/useNow';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export type IncidentEvent =
  | { type: 'created'; incident: Incident; own: boolean }
  | { type: 'updated'; incident: Incident; previous?: Incident };

interface IncidentContextType {
  incidents: Incident[];
  loading: boolean;
  caps: SchemaCaps;
  updates: Record<string, IncidentUpdate[]>;
  byId: (id: string) => Incident | undefined;
  loadUpdates: (id: string) => Promise<void>;
  createIncident: (input: NewIncidentInput) => Promise<Incident>;
  setStatus: (id: string, status: IncidentStatus, note?: string) => Promise<void>;
  setPriority: (id: string, priority: Priority) => Promise<void>;
  assign: (id: string, toMe: boolean) => Promise<void>;
  addNote: (id: string, body: string, internal: boolean) => Promise<void>;
  markSeen: (id: string) => Promise<void>;
  subscribe: (fn: (ev: IncidentEvent) => void) => () => void;
  /** Demo mode: inject a canned incoming report (exercises alerts end to end). */
  simulateIncoming?: () => void;
  resetDemo?: () => void;
}

const IncidentContext = createContext<IncidentContextType | null>(null);

const DEMO_KEY = 'dt-demo-incidents-v2';
const EMPTY: Incident[] = [];
/** Before migration 0007, how often a member's dashboard looks for it. */
const RECHECK_MS = 120_000;
let channelSeq = 0;

function loadDemo(): { incidents: Incident[]; updates: IncidentUpdate[] } {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { incidents: Incident[]; updates: IncidentUpdate[]; savedAt: number };
      // Re-seed stale demo data so relative times stay believable.
      if (Date.now() - parsed.savedAt < 12 * 3_600_000) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh = buildDemoData();
  return { incidents: fresh.incidents, updates: fresh.updates };
}

function groupUpdates(list: IncidentUpdate[]): Record<string, IncidentUpdate[]> {
  const out: Record<string, IncidentUpdate[]> = {};
  for (const u of list) (out[u.incidentId] ??= []).push(u);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

export function IncidentProvider({ children }: { children: ReactNode }) {
  const { configured, user, userId, displayName, role } = useAuth();
  const toast = useToast();
  const demo = !configured;

  const [demoState] = useState(() => (demo ? loadDemo() : null));
  const [incidents, setIncidents] = useState<Incident[]>(() => sortIncidents(demoState?.incidents ?? []));
  const [updates, setUpdates] = useState<Record<string, IncidentUpdate[]>>(() =>
    groupUpdates(demoState?.updates ?? []),
  );
  const [caps, setCaps] = useState<SchemaCaps>(demo ? FULL_CAPS : UNCHECKED_CAPS);
  /** Which signed-in user the connected data was loaded for. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  /** Bumped when migration 0007 turns up while a member's dashboard is open: load again from the copies. */
  const [recheck, setRecheck] = useState(0);

  const listeners = useRef(new Set<(ev: IncidentEvent) => void>());
  const incidentsRef = useRef(incidents);
  const capsRef = useRef(caps);
  const meRef = useRef({ userId, displayName, role });
  /** Community reports this member marked as seen (the copies carry only a count). */
  const seenRef = useRef(new Set<string>());
  const simSeq = useRef(0);

  useEffect(() => {
    incidentsRef.current = incidents;
  }, [incidents]);
  useEffect(() => {
    capsRef.current = caps;
  }, [caps]);
  useEffect(() => {
    meRef.current = { userId, displayName, role };
  }, [userId, displayName, role]);

  const emit = useCallback((ev: IncidentEvent) => {
    listeners.current.forEach((fn) => {
      try {
        fn(ev);
      } catch (err) {
        console.error('[incidents] listener failed', err);
      }
    });
  }, []);

  const subscribe = useCallback((fn: (ev: IncidentEvent) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  // ── Demo persistence ────────────────────────────────────────────────────
  useEffect(() => {
    if (!demo) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DEMO_KEY,
          JSON.stringify({ incidents, updates: Object.values(updates).flat(), savedAt: Date.now() }),
        );
      } catch {
        /* storage full (photos) — keep going in memory */
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [demo, incidents, updates]);

  // ── Connected: load + realtime ──────────────────────────────────────────
  // Officers and admins read every report from `reports`. A member business reads its own reports there (every
  // field) and everyone else's community reports from `community_reports` (migration 0007): copies without the
  // reporter, contact details, transcript, photos or internal fields. Until 0007 is applied a member reads
  // `reports` as before and looks for it every two minutes, so an open dashboard switches over by itself.
  useEffect(() => {
    if (demo || !user || !role) return;
    let active = true;
    const me = user.id;
    const member = role === 'business';
    const channels: RealtimeChannel[] = [];
    let lookTimer: number | undefined;
    let onVisible: (() => void) | undefined;
    seenRef.current = new Set();

    const onChange = (from: FeedChange['from'], payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      let change: FeedChange;
      if (payload.eventType === 'DELETE') {
        const id = (payload.old as { id?: string }).id;
        if (!id) return;
        change = { from, type: 'DELETE', id };
      } else {
        const row = payload.new;
        const incident =
          from === 'community'
            ? communityRowToIncident(row as unknown as CommunityReportRow, seenRef.current.has(String(row.id)) ? me : null)
            : rowToIncident(row as unknown as ReportRow);
        change = { from, type: payload.eventType, incident };
      }
      const { event } = applyFeedChange(incidentsRef.current, change);
      setIncidents((prev) => applyFeedChange(prev, change).list);
      if (event?.type === 'created') {
        bumpNow();
        emit({ type: 'created', incident: event.incident, own: event.incident.reporterId === meRef.current.userId });
      } else if (event) {
        emit(event);
      }
    };

    // Both tables on one channel: Realtime keeps their order, so a member's own new report (from `reports`)
    // always lands before its copy and is never announced to them as a nearby alert.
    const listen = (copies: boolean) => {
      let channel = supabase
        .channel(`reports-${++channelSeq}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, (p) => onChange('reports', p));
      if (copies) {
        channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'community_reports' }, (p) =>
          onChange('community', p),
        );
      }
      channels.push(channel.subscribe());
    };

    // Officers and admins: every report, subscribed at once.
    if (!member) listen(false);

    channels.push(
      supabase
        .channel(`report-updates-${++channelSeq}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'report_updates' }, (payload) => {
          const u = rowToUpdate(payload.new as UpdateRow);
          setUpdates((prev) => {
            const list = prev[u.incidentId] ?? [];
            if (list.some((x) => x.id === u.id)) return prev;
            return { ...prev, [u.incidentId]: [...list, u].sort((a, b) => a.createdAt - b.createdAt) };
          });
        })
        .subscribe(),
    );

    (async () => {
      const found = await detectSchema();
      if (!active) return;
      setCaps(found);
      const copies = member && found.community;
      if (member) listen(copies);

      if (member && !copies) {
        // Before migration 0007: when it turns up, load again from the copies.
        const look = () => {
          void hasCommunityReports().then((ok) => {
            if (active && ok) setRecheck((n) => n + 1);
          });
        };
        lookTimer = window.setInterval(look, RECHECK_MS);
        onVisible = () => {
          if (document.visibilityState === 'visible') look();
        };
        document.addEventListener('visibilitychange', onVisible);
      }

      const updatesQuery = found.updates
        ? supabase.from('report_updates').select('*').order('created_at', { ascending: false }).limit(600)
        : Promise.resolve({ data: [] as UpdateRow[], error: null });

      if (copies) {
        const [own, shared, seen, upd] = await Promise.all([
          supabase.from('reports').select('*').eq('reporter_id', me).order('created_at', { ascending: false }).limit(500),
          supabase
            .from('community_reports')
            .select(COMMUNITY_REPORT_COLUMNS.join(', '))
            .order('created_at', { ascending: false })
            .limit(500),
          supabase.rpc('my_seen_report_ids'),
          updatesQuery,
        ]);
        if (!active) return;
        // A failed read keeps what is on screen rather than showing "all clear".
        if (own.error) throw own.error;
        if (shared.error) throw shared.error;
        // Merged, not replaced: a mark made while this was loading stays.
        if (!seen.error && Array.isArray(seen.data)) for (const id of seen.data as string[]) seenRef.current.add(id);
        const seenNow = seenRef.current;
        setIncidents(
          mergeFeeds(
            (own.data ?? []).map((r) => rowToIncident(r as ReportRow)),
            ((shared.data ?? []) as unknown as CommunityReportRow[]).map((r) =>
              communityRowToIncident(r, seenNow.has(r.id) ? me : null),
            ),
          ),
        );
        if (!upd.error) setUpdates(groupUpdates(((upd.data ?? []) as UpdateRow[]).map(rowToUpdate)));
      } else {
        const [reports, upd] = await Promise.all([
          supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(500),
          updatesQuery,
        ]);
        if (!active) return;
        // A failed read keeps what is on screen rather than showing "all clear".
        if (reports.error) throw reports.error;
        setIncidents(sortIncidents((reports.data ?? []).map((r) => rowToIncident(r as ReportRow))));
        if (!upd.error) setUpdates(groupUpdates(((upd.data ?? []) as UpdateRow[]).map(rowToUpdate)));
      }
      setLoadedFor(me);
    })().catch((err) => {
      console.error('[incidents] load failed', err);
      if (active) setLoadedFor(me);
    });

    return () => {
      active = false;
      channels.forEach((c) => supabase.removeChannel(c));
      if (lookTimer !== undefined) window.clearInterval(lookTimer);
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    };
  }, [demo, user, role, emit, recheck]);

  // ── Helpers ─────────────────────────────────────────────────────────────
  const byId = useCallback((id: string) => incidents.find((i) => i.id === id), [incidents]);

  /** Optimistic local patch; returns the before/after snapshots (for rollback + events). */
  const patchLocal = useCallback((id: string, patch: Partial<Incident>) => {
    const previous = incidentsRef.current.find((i) => i.id === id);
    if (!previous) return { next: undefined, previous: undefined };
    const next: Incident = { ...previous, ...patch, updatedAt: Date.now() };
    incidentsRef.current = incidentsRef.current.map((i) => (i.id === id ? next : i));
    setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: next.updatedAt } : i)));
    return { next, previous };
  }, []);

  const appendUpdate = useCallback((u: IncidentUpdate) => {
    setUpdates((prev) => {
      const list = prev[u.incidentId] ?? [];
      if (list.some((x) => x.id === u.id)) return prev;
      return { ...prev, [u.incidentId]: [...list, u] };
    });
  }, []);

  /**
   * Write a timeline entry (connected: report_updates; demo: local). Side
   * entries (status, assignment…) only log a failure; `strict` throws it, for
   * writes the user typed and must not lose (notes).
   */
  const recordUpdate = useCallback(
    async (
      incidentId: string,
      kind: UpdateKind,
      body: string,
      internal = false,
      meta?: Record<string, unknown>,
      strict = false,
    ) => {
      const me = meRef.current;
      const local: IncidentUpdate = {
        id: generateId(),
        incidentId,
        authorId: me.userId ?? undefined,
        authorName: kind === 'system' ? 'System' : me.displayName,
        authorRole: kind === 'system' ? 'system' : (me.role ?? undefined),
        kind,
        body,
        internal,
        createdAt: Date.now(),
        meta,
      };
      if (demo) {
        appendUpdate(local);
        return;
      }
      if (!capsRef.current.updates) return;
      const { data, error } = await supabase
        .from('report_updates')
        .insert({
          report_id: incidentId,
          author_id: me.userId,
          author_name: local.authorName,
          author_role: local.authorRole,
          kind,
          body,
          internal,
          meta: meta ?? {},
        })
        .select()
        .single();
      if (error) {
        if (strict) throw new Error(error.message);
        console.warn('[incidents] timeline write failed', error);
        return;
      }
      if (data) appendUpdate(rowToUpdate(data as UpdateRow));
    },
    [demo, appendUpdate],
  );

  const loadUpdates = useCallback(
    async (id: string) => {
      if (demo || !capsRef.current.updates) return;
      const { data } = await supabase
        .from('report_updates')
        .select('*')
        .eq('report_id', id)
        .order('created_at', { ascending: true });
      if (data) {
        setUpdates((prev) => ({ ...prev, [id]: (data as UpdateRow[]).map(rowToUpdate) }));
      }
    },
    [demo],
  );

  // ── Create ──────────────────────────────────────────────────────────────
  const createIncident = useCallback(
    async (input: NewIncidentInput): Promise<Incident> => {
      const me = meRef.current;
      const via =
        input.kind === 'voice' ? 'by voice interview' : input.kind === 'quick' ? 'as a quick alert' : 'via the report form';

      if (demo) {
        const id = `demo-${generateId()}`;
        const now = Date.now();
        const photos = input.photoFiles?.length ? await photosToDataUrls(input.photoFiles) : [];
        const inc: Incident = {
          id,
          ref: incidentRef(id.replace('demo-', '')),
          source: input.source,
          kind: input.kind,
          category: input.category,
          categoryLabel: categoryMeta(input.category).label,
          priority: input.priority,
          status: 'active',
          title: input.title,
          description: input.description,
          transcript: input.transcript,
          reporterId: me.userId ?? undefined,
          reporterName: input.reporterName,
          businessId: input.businessId,
          address: input.address,
          locationNote: input.locationNote,
          lat: input.lat,
          lng: input.lng,
          createdAt: now,
          occurredAt: input.occurredAt ?? now,
          updatedAt: now,
          happeningNow: Boolean(input.happeningNow),
          weaponsSeen: Boolean(input.weaponsSeen),
          injuries: Boolean(input.injuries),
          subjects: input.subjects ?? [],
          vehicles: input.vehicles ?? [],
          photos,
          seenBy: [],
          visibility: input.visibility ?? 'community',
          contactOk: input.contactOk ?? true,
          contactPhone: input.contactPhone,
          boloId: input.boloId,
          aiSummary: input.aiSummary,
        };
        setIncidents((prev) => sortIncidents([inc, ...prev]));
        appendUpdate({
          id: generateId(),
          incidentId: id,
          authorName: 'System',
          authorRole: 'system',
          kind: 'system',
          body: `Report received ${via}.`,
          internal: false,
          createdAt: now,
        });
        bumpNow();
        emit({ type: 'created', incident: inc, own: true });
        return inc;
      }

      // Don't file before the schema check finishes: an unchecked session
      // would write the legacy row shape and drop visibility and photos.
      if (!capsRef.current.checked) {
        const found = await detectSchema();
        capsRef.current = found;
        setCaps(found);
      }
      let v2 = capsRef.current.v2;
      // Photos are a bonus: if they can't upload, the report still goes through.
      let photos: string[] = [];
      if (v2 && input.photoFiles?.length && me.userId) {
        try {
          photos = await uploadReportPhotos(input.photoFiles, me.userId);
        } catch (err) {
          toast.push({
            tone: 'warning',
            title: 'Photos didn’t upload',
            body: `Your report is still being sent without them. ${err instanceof Error ? err.message : ''}`.trim(),
          });
        }
      }

      let result = await supabase
        .from('reports')
        .insert(newIncidentRow(input, me.userId, photos, v2))
        .select()
        .single();
      if (result.error && v2 && isSchemaError(result.error)) {
        // The database is still on the original schema — file the legacy shape.
        v2 = false;
        setCaps((c) => ({ ...c, v2: false }));
        result = await supabase.from('reports').insert(newIncidentRow(input, me.userId, [], false)).select().single();
      }
      if (result.error) throw new Error(result.error.message);

      const inc = rowToIncident(result.data as ReportRow);
      // Added once; if its community copy got here first, the full row replaces it.
      setIncidents((prev) => applyFeedChange(prev, { from: 'reports', type: 'INSERT', incident: inc }).list);
      bumpNow();
      emit({ type: 'created', incident: inc, own: true });
      void recordUpdate(inc.id, 'system', `Report received ${via}.`);
      return inc;
    },
    [demo, emit, appendUpdate, recordUpdate, toast],
  );

  // ── Officer actions ─────────────────────────────────────────────────────
  const setStatus = useCallback(
    async (id: string, status: IncidentStatus, note?: string) => {
      const current = incidentsRef.current.find((i) => i.id === id);
      if (!current || current.status === status) return;
      const now = Date.now();
      const patch: Partial<Incident> = { status };
      if ((status === 'acknowledged' || status === 'responding') && !current.acknowledgedAt) patch.acknowledgedAt = now;
      if ((status === 'resolved' || status === 'dismissed') && !current.resolvedAt) patch.resolvedAt = now;
      if (status === 'active') patch.resolvedAt = undefined;
      const { next, previous } = patchLocal(id, patch);

      const label = STATUSES[status].label;
      const body = note ? `${label} — ${note}` : label;

      if (!demo) {
        const v2 = capsRef.current.v2;
        const row: Record<string, unknown> = { status: v2 ? status : legacyStatus(status) };
        if (v2) {
          if (patch.acknowledgedAt) row.acknowledged_at = new Date(patch.acknowledgedAt).toISOString();
          if (patch.resolvedAt) row.resolved_at = new Date(patch.resolvedAt).toISOString();
          if (status === 'active') row.resolved_at = null;
        }
        const { error } = await supabase.from('reports').update(row).eq('id', id);
        if (error) {
          if (previous) patchLocal(id, previous);
          throw new Error(error.message);
        }
      }
      if (next) emit({ type: 'updated', incident: next, previous });
      await recordUpdate(id, 'status', body, false, { status });
    },
    [demo, patchLocal, recordUpdate, emit],
  );

  const setPriority = useCallback(
    async (id: string, priority: Priority) => {
      const current = incidentsRef.current.find((i) => i.id === id);
      if (!current || current.priority === priority) return;
      const { next, previous } = patchLocal(id, { priority });
      if (!demo) {
        if (!capsRef.current.v2) {
          if (previous) patchLocal(id, previous);
          throw new Error('Priorities need database migration 0002.');
        }
        const { error } = await supabase.from('reports').update({ priority }).eq('id', id);
        if (error) {
          if (previous) patchLocal(id, previous);
          throw new Error(error.message);
        }
      }
      if (next) emit({ type: 'updated', incident: next, previous });
      await recordUpdate(id, 'priority', `Priority set to ${PRIORITIES[priority].short} · ${PRIORITIES[priority].label}`, true);
    },
    [demo, patchLocal, recordUpdate, emit],
  );

  const assign = useCallback(
    async (id: string, toMe: boolean) => {
      const me = meRef.current;
      const patch: Partial<Incident> = toMe
        ? { assignedTo: me.userId ?? undefined, assignedName: me.displayName }
        : { assignedTo: undefined, assignedName: undefined };
      const { previous } = patchLocal(id, patch);
      if (!demo) {
        if (!capsRef.current.v2) {
          if (previous) patchLocal(id, previous);
          throw new Error('Assignments need database migration 0002.');
        }
        const { error } = await supabase
          .from('reports')
          .update({ assigned_to: toMe ? me.userId : null, assigned_name: toMe ? me.displayName : null })
          .eq('id', id);
        if (error) {
          if (previous) patchLocal(id, previous);
          throw new Error(error.message);
        }
      }
      await recordUpdate(id, 'assignment', toMe ? `Assigned to ${me.displayName}` : 'Unassigned', false);
    },
    [demo, patchLocal, recordUpdate],
  );

  const addNote = useCallback(
    async (id: string, body: string, internal: boolean) => {
      const text = body.trim();
      if (!text) return;
      if (!demo && !capsRef.current.updates) throw new Error('Notes need database migration 0002.');
      await recordUpdate(id, 'note', text, internal, undefined, true);
    },
    [demo, recordUpdate],
  );

  const markSeen = useCallback(
    async (id: string) => {
      const me = meRef.current;
      const marker = me.userId;
      if (!marker) return;
      const current = incidentsRef.current.find((i) => i.id === id);
      if (!current || current.seenBy.includes(marker)) return;
      seenRef.current.add(id);
      patchLocal(id, {
        seenBy: [...current.seenBy, marker],
        ...(current.seenCount !== undefined ? { seenCount: current.seenCount + 1 } : {}),
      });
      if (demo) return;
      const { error } = await supabase.rpc('mark_report_seen', { p_report: id });
      if (error) console.warn('[incidents] mark seen failed (run migration 0002)', error.message);
    },
    [demo, patchLocal],
  );

  // ── Demo helpers ────────────────────────────────────────────────────────
  const simulateIncoming = useCallback(() => {
    const inc = demoIncomingIncident(simSeq.current++);
    setIncidents((prev) => sortIncidents([inc, ...prev]));
    appendUpdate({
      id: generateId(),
      incidentId: inc.id,
      authorName: 'System',
      authorRole: 'system',
      kind: 'system',
      body: `Report received ${inc.kind === 'voice' ? 'by voice interview' : 'as a quick alert'}.`,
      internal: false,
      createdAt: inc.createdAt,
    });
    bumpNow();
    emit({ type: 'created', incident: inc, own: false });
  }, [appendUpdate, emit]);

  const resetDemo = useCallback(() => {
    const fresh = buildDemoData();
    setIncidents(sortIncidents(fresh.incidents));
    setUpdates(groupUpdates(fresh.updates));
    try {
      localStorage.removeItem(DEMO_KEY);
      localStorage.removeItem('dt-demo-bolos-v2');
    } catch {
      /* ignore */
    }
  }, []);

  // Signed-out visitors (connected mode) see nothing; RLS would return nothing anyway.
  const visible = demo || user ? incidents : EMPTY;
  const loading = !demo && Boolean(user) && loadedFor !== user?.id;

  const value = useMemo<IncidentContextType>(
    () => ({
      incidents: visible,
      loading,
      caps,
      updates,
      byId,
      loadUpdates,
      createIncident,
      setStatus,
      setPriority,
      assign,
      addNote,
      markSeen,
      subscribe,
      simulateIncoming: demo ? simulateIncoming : undefined,
      resetDemo: demo ? resetDemo : undefined,
    }),
    [
      visible,
      loading,
      caps,
      updates,
      byId,
      loadUpdates,
      createIncident,
      setStatus,
      setPriority,
      assign,
      addNote,
      markSeen,
      subscribe,
      demo,
      simulateIncoming,
      resetDemo,
    ],
  );

  return <IncidentContext.Provider value={value}>{children}</IncidentContext.Provider>;
}

export function useIncidents(): IncidentContextType {
  const ctx = useContext(IncidentContext);
  if (!ctx) throw new Error('useIncidents must be used within IncidentProvider');
  return ctx;
}
