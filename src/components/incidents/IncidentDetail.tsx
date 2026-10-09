import { useEffect, useState } from 'react';
import {
  CheckCheck,
  ChevronDown,
  Clock,
  Eye,
  ImageOff,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Play,
  RotateCcw,
  ScanEye,
  Send,
  Siren,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import type { Incident, Priority } from '../../types';
import { useIncidents } from '../../context/IncidentContext';
import { useBolos } from '../../context/BoloContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { incidentReadout } from '../../lib/announce';
import { categoryMeta, PRIORITIES, PRIORITY_LIST, RESOLUTIONS, STATUSES, isOpen } from '../../lib/taxonomy';
import { cn, dayTime, generateId, shortAddress, timeAgo } from '../../lib/format';
import { subjectLine, vehicleLine } from '../../lib/incidentRows';
import { Button, IconButton } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Dialog } from '../ui/Overlay';
import { Field, Input, Segmented, Switch, Textarea } from '../ui/Form';
import ListenButton from '../voice/ListenButton';
import { CategoryIcon, FlagTags, KindTag, PriorityBadge, StatusPill } from './Badges';
import { SubjectDetails, VehicleDetails } from './Descriptions';
import PhotoGallery from './PhotoGallery';
import Timeline from './Timeline';

export type DetailMode = 'officer' | 'reporter' | 'community';

interface IncidentDetailProps {
  incident: Incident;
  mode: DetailMode;
  now: number;
  onClose?: () => void;
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4 sm:px-6">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function IncidentDetail({ incident: i, mode, now, onClose }: IncidentDetailProps) {
  const { updates, loadUpdates, setStatus, setPriority, assign, addNote, markSeen, caps } = useIncidents();
  const { userId } = useAuth();
  const { push } = useToast();
  const officer = mode === 'officer';
  const list = updates[i.id] ?? [];

  const [note, setNote] = useState('');
  const [internal, setInternal] = useState(officer);
  const [sending, setSending] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [boloOpen, setBoloOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    void loadUpdates(i.id);
  }, [i.id, loadUpdates]);

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) push({ title: ok, tone: 'success', duration: 3000 });
    } catch (err) {
      push({ title: 'Couldn’t update the report', body: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const sendNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await addNote(i.id, note, officer ? internal : false);
      setNote('');
    } catch (err) {
      push({ title: 'Note not saved', body: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };

  const meta = categoryMeta(i.category);
  const mine = Boolean(userId && i.assignedTo === userId);
  const seen = Boolean(userId && i.seenBy.includes(userId));
  // Other members' reports (`limited`) carry counts: who saw it and the photos stay private.
  const seenCount = i.seenCount ?? i.seenBy.length;
  const photoCount = i.photoCount ?? i.photos.length;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lng}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pb-4 pt-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2.5">
            <span className="font-mono text-[12px] font-semibold text-muted">{i.ref}</span>
            <KindTag kind={i.kind} source={i.source} />
          </span>
          <div className="flex items-center gap-1">
            <ListenButton variant="icon" text={() => incidentReadout(i)} speechKey={`incident-${i.id}`} label="Read this report aloud" />
            {onClose && (
              <IconButton label="Close" onClick={onClose}>
                <X className="h-5 w-5" />
              </IconButton>
            )}
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CategoryIcon category={i.category} priority={i.priority} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-muted">{i.categoryLabel || meta.label}</p>
            <h2 className="mt-0.5 text-lg font-bold leading-snug text-ink">{i.title}</h2>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={i.priority} withLabel />
          <StatusPill status={i.status} reporterView={mode === 'reporter'} />
          <FlagTags incident={i} />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Reported {timeAgo(i.createdAt, now)} · {dayTime(i.createdAt)}
          </span>
          {Math.abs(i.occurredAt - i.createdAt) > 5 * 60_000 && <span>Happened {dayTime(i.occurredAt)}</span>}
        </p>

        {/* Officer actions */}
        {officer && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {i.status === 'active' && (
                <Button size="sm" icon={<Eye className="h-4 w-4" />} loading={busy === 'ack'} onClick={() => void run('ack', () => setStatus(i.id, 'acknowledged'), 'Acknowledged')}>
                  Acknowledge
                </Button>
              )}
              {(i.status === 'active' || i.status === 'acknowledged') && (
                <Button
                  size="sm"
                  variant={i.status === 'active' ? 'secondary' : 'primary'}
                  icon={<Siren className="h-4 w-4" />}
                  loading={busy === 'resp'}
                  onClick={() => void run('resp', () => setStatus(i.id, 'responding'), 'Marked responding')}
                >
                  Responding
                </Button>
              )}
              {isOpen(i.status) ? (
                <Button size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" />} onClick={() => setResolveOpen(true)}>
                  Resolve…
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} loading={busy === 'reopen'} onClick={() => void run('reopen', () => setStatus(i.id, 'active', 'Reopened'), 'Reopened')}>
                  Reopen
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                icon={mine ? <UserMinus className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                loading={busy === 'assign'}
                onClick={() => void run('assign', () => assign(i.id, !mine))}
              >
                {mine ? 'Unassign me' : i.assignedName ? `Take over from ${i.assignedName.split(' ').slice(-1)[0]}` : 'Assign to me'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-muted">Priority</span>
              <Segmented<string>
                size="sm"
                label="Priority"
                value={String(i.priority)}
                onChange={(v) => void run('prio', () => setPriority(i.id, Number(v) as Priority))}
                options={PRIORITY_LIST.map((p) => ({ value: String(p), label: PRIORITIES[p].short }))}
              />
              <a
                href={directions}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-3"
              >
                <Navigation className="h-4 w-4" /> Directions
              </a>
              {(i.subjects.length > 0 || i.vehicles.length > 0) && (
                <Button size="sm" variant="ghost" icon={<ScanEye className="h-4 w-4" />} onClick={() => setBoloOpen(true)}>
                  BOLO
                </Button>
              )}
            </div>
            {i.assignedName && (
              <p className="text-[12px] text-muted">
                Assigned to <span className="font-semibold text-ink-2">{i.assignedName}</span>
              </p>
            )}
          </div>
        )}

        {mode === 'community' && (
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" variant={seen ? 'subtle' : 'secondary'} icon={<Eye className="h-4 w-4" />} disabled={seen} onClick={() => void markSeen(i.id)}>
              {seen ? 'Marked as seen' : 'Mark as seen'}
            </Button>
            {seenCount > 0 && <span className="text-[12px] text-muted">{seenCount} nearby {seenCount === 1 ? 'business has' : 'businesses have'} seen this</span>}
          </div>
        )}

        {mode === 'reporter' && (
          <Banner tone={isOpen(i.status) ? 'info' : 'success'} className="mt-4" title={STATUSES[i.status].reporterLabel}>
            {STATUSES[i.status].description}. You’ll see officer updates here{i.status === 'active' ? ' as soon as someone picks it up' : ''}.
          </Banner>
        )}
      </div>

      {/* Body */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {i.description && (
          <Section title="What happened">
            <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{i.description}</p>
          </Section>
        )}

        <Section
          title="Where"
          action={
            <a href={directions} target="_blank" rel="noopener noreferrer" className="text-[12px] font-semibold text-accent-strong hover:underline">
              Open in Maps
            </a>
          }
        >
          <p className="flex items-start gap-2 text-[14px] text-ink">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
            <span>
              {shortAddress(i.address) || 'Location pinned on the map'}
              {i.locationNote && <span className="block text-[13px] text-muted">{i.locationNote}</span>}
            </span>
          </p>
        </Section>

        {(i.subjects.length > 0 || i.vehicles.length > 0) && (
          <Section title={`Described · ${i.subjects.length + i.vehicles.length}`}>
            <div className="space-y-2">
              {i.subjects.map((s, idx) => (
                <SubjectDetails key={s.id} subject={s} index={idx} />
              ))}
              {i.vehicles.map((v, idx) => (
                <VehicleDetails key={v.id} vehicle={v} index={idx} />
              ))}
            </div>
          </Section>
        )}

        {i.photos.length > 0 ? (
          <Section title={`Photos · ${i.photos.length}`}>
            <PhotoGallery refs={i.photos} />
          </Section>
        ) : (
          photoCount > 0 && (
            <Section title={`Photos · ${photoCount}`}>
              <p className="flex items-center gap-2 text-[13px] text-muted">
                <ImageOff className="h-4 w-4" /> Photos are only visible to officers and the reporter.
              </p>
            </Section>
          )
        )}

        {officer && (
          <Section title="Reporter">
            <p className="text-[14px] font-medium text-ink">{i.reporterName}</p>
            <p className="text-[13px] text-muted">
              {i.source === 'officer' ? 'Public-safety officer' : 'Member business'}
              {i.visibility === 'officers' ? ' · shared with officers only' : ' · shared with nearby businesses'}
            </p>
            {i.contactOk && i.contactPhone ? (
              <a href={`tel:${i.contactPhone}`} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent-strong hover:underline">
                <Phone className="h-4 w-4" /> Call {i.contactPhone}
              </a>
            ) : (
              !i.contactOk && <p className="mt-1 text-[12px] text-subtle">Asked not to be contacted.</p>
            )}
          </Section>
        )}

        {i.transcript && (officer || mode === 'reporter') && (
          <Section
            title="Interview transcript"
            action={
              <button type="button" onClick={() => setShowTranscript((s) => !s)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-ink">
                {showTranscript ? 'Hide' : 'Show'} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTranscript && 'rotate-180')} />
              </button>
            }
          >
            {showTranscript ? (
              <p className="whitespace-pre-line rounded-xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">{i.transcript}</p>
            ) : (
              <p className="text-[13px] text-subtle">The caller’s words from the voice interview.</p>
            )}
          </Section>
        )}

        {(officer || mode === 'reporter') && (
          <Section title="Timeline">
            {!caps.updates && !caps.checked ? null : !caps.updates ? (
              <p className="text-[13px] text-subtle">The incident timeline turns on after database migration 0002.</p>
            ) : (
              <Timeline updates={list} now={now} hideInternal={!officer} />
            )}
          </Section>
        )}
      </div>

      {/* Note composer */}
      {(officer || mode === 'reporter') && caps.updates && (
        <form
          className="flex-shrink-0 border-t border-line bg-surface-2 px-4 py-3 sm:px-5"
          onSubmit={(e) => {
            e.preventDefault();
            void sendNote();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void sendNote();
              }}
              rows={1}
              placeholder={officer ? 'Add a note or update…' : 'Add more information for the officers…'}
              className="input max-h-32 min-h-10 flex-1 resize-none"
              aria-label="Note"
            />
            <IconButton label="Send note" variant="primary" type="submit" disabled={!note.trim() || sending}>
              <Send className="h-4 w-4" />
            </IconButton>
          </div>
          {officer && (
            <div className="mt-2 flex items-center gap-2">
              <Switch size="sm" checked={internal} onChange={setInternal} />
              <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                {internal ? <Lock className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {internal ? 'Internal — officers only' : 'Visible to the reporter'}
              </span>
            </div>
          )}
        </form>
      )}

      <ResolveDialog
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onResolve={(status, reason) =>
          void run('resolve', async () => {
            await setStatus(i.id, status, reason);
            setResolveOpen(false);
          }, status === 'resolved' ? 'Resolved' : 'Closed')
        }
      />
      {officer && <BoloFromIncident open={boloOpen} onClose={() => setBoloOpen(false)} incident={i} />}
    </div>
  );
}

function ResolveDialog({
  open,
  onClose,
  onResolve,
}: {
  open: boolean;
  onClose: () => void;
  onResolve: (status: 'resolved' | 'dismissed', reason: string) => void;
}) {
  const [reason, setReason] = useState<string>(RESOLUTIONS[0]);
  const [extra, setExtra] = useState('');
  const dismiss = reason === 'Unfounded' || reason === 'Duplicate report';
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Close this report"
      description="Pick an outcome. The reporter sees it on their dashboard."
      icon={<CheckCheck className="h-5 w-5" />}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onResolve(dismiss ? 'dismissed' : 'resolved', extra.trim() ? `${reason}. ${extra.trim()}` : reason)}>
            {dismiss ? 'Close report' : 'Mark resolved'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {RESOLUTIONS.map((r) => (
          <label key={r} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[14px] transition-colors', reason === r ? 'border-accent bg-accent-soft/60 text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
            <input type="radio" name="resolution" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-[var(--primary)]" />
            {r}
          </label>
        ))}
      </div>
      <Field label="Note" optional className="mt-4">
        {(id) => <Input id={id} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. Spoke with the manager, subject left the area" />}
      </Field>
    </Dialog>
  );
}

function BoloFromIncident({ open, onClose, incident }: { open: boolean; onClose: () => void; incident: Incident }) {
  const { createBolo, available } = useBolos();
  const { push } = useToast();
  const person = incident.subjects[0];
  const vehicle = incident.vehicles[0];
  const kind: 'person' | 'vehicle' = person ? 'person' : 'vehicle';
  const [title, setTitle] = useState(
    kind === 'person' ? `${categoryMeta(incident.category).short} — ${shortAddress(incident.address)}` : `${vehicleLine(vehicle).split(' · ')[0] || 'Vehicle'} — ${shortAddress(incident.address)}`,
  );
  const [summary, setSummary] = useState(incident.description);
  const [days, setDays] = useState('7');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await createBolo({
        kind,
        title: title.trim() || 'Be on the lookout',
        summary: summary.trim(),
        subject: person ? { ...person, id: generateId() } : undefined,
        vehicle: !person && vehicle ? { ...vehicle, id: generateId() } : undefined,
        incidentIds: [incident.id],
        expiresInDays: Number(days),
        lastSeenAt: incident.occurredAt,
        lastSeenLocation: incident.address,
        lastSeenLat: incident.lat,
        lastSeenLng: incident.lng,
      });
      push({ title: 'BOLO published', body: 'Businesses will see it on the Lookout board.', tone: 'success' });
      onClose();
    } catch (err) {
      push({ title: 'BOLO not published', body: err instanceof Error ? err.message : undefined, tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Publish a BOLO"
      description="Share a be-on-the-lookout notice with officers and member businesses."
      icon={<ScanEye className="h-5 w-5" />}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" loading={saving} disabled={!available} onClick={() => void save()}>
            Publish
          </Button>
        </>
      }
    >
      {!available && (
        <Banner tone="warning" className="mb-4">
          The Lookout board needs database migration 0002.
        </Banner>
      )}
      <div className="space-y-4">
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Field label="Summary" hint="Describe behavior and what to watch for. Never include race or ethnicity alone.">
          {(id) => <Textarea id={id} rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <div className="rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
          <p className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-subtle">{kind === 'person' ? 'Person' : 'Vehicle'}</p>
          {kind === 'person' ? subjectLine(person) || 'No description' : vehicleLine(vehicle) || 'No description'}
        </div>
        <Field label="Expires in">
          {() => (
            <Segmented
              value={days}
              onChange={setDays}
              options={[
                { value: '3', label: '3 days' },
                { value: '7', label: '7 days' },
                { value: '14', label: '14 days' },
              ]}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
