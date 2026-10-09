import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  DoorOpen,
  Inbox,
  KeyRound,
  Lock,
  Map as MapIcon,
  Plus,
  QrCode,
  RefreshCw,
  Ticket,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAppSettings } from '../../hooks/useAppSettings';
import { useNow } from '../../hooks/useNow';
import { cn, relativeTime, timeAgo } from '../../lib/format';
import { messageOf } from '../account/util';
import { Button, IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Banner, EmptyState } from '../ui/Feedback';
import { Field, Input, Select, Switch } from '../ui/Form';
import { Dialog } from '../ui/Overlay';
import AccessCodeQr from './AccessCodeQr';
import ListSkeleton from './ListSkeleton';
import { codeStatus, joinLink, STATUS_LABEL, type AccessCode, type CodeRole } from './membership';
import { useMembership } from './useMembership';

const EXPIRY: { label: string; days: number | null }[] = [
  { label: 'Never', days: null },
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const DELAYS = [0, 15, 30, 60, 120];

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  full: 'bg-surface-3 text-muted',
  expired: 'bg-surface-3 text-muted',
  revoked: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

async function copyText(text: string, push: ReturnType<typeof useToast>['push'], title: string) {
  try {
    await navigator.clipboard.writeText(text);
    push({ title, body: text, tone: 'success' });
  } catch {
    window.prompt('Copy', text);
  }
}

// ── New code ──────────────────────────────────────────────────────────────────

type Membership = ReturnType<typeof useMembership>;
type Settings = ReturnType<typeof useAppSettings>;

function NewCodeForm({
  createCode,
  onCreate,
  onCancel,
}: {
  createCode: Membership['createCode'];
  onCreate: (c: AccessCode) => void;
  onCancel: () => void;
}) {
  const { push } = useToast();
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<CodeRole>('business');
  const [seats, setSeats] = useState('10');
  const [expiry, setExpiry] = useState(2);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickRole = (r: CodeRole) => {
    setRole(r);
    // Officer codes open officer tools: default to one seat.
    setSeats(r === 'officer' ? '1' : '10');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(seats);
    if (!label.trim()) return setError('Give the code a label so you know who it’s for.');
    if (!Number.isInteger(n) || n < 1 || n > 1000) return setError('Seats must be a whole number from 1 to 1000.');
    if (custom.trim() && !/^[A-Za-z0-9][A-Za-z0-9-]{4,30}[A-Za-z0-9]$/.test(custom.trim())) {
      return setError('A custom code needs 6–32 letters, numbers or dashes.');
    }
    setBusy(true);
    setError('');
    try {
      const days = EXPIRY[expiry].days;
      const c = await createCode({
        label: label.trim(),
        role,
        seats: n,
        expiresAt: days ? Date.now() + days * 86_400_000 : null,
        code: custom.trim() || undefined,
      });
      push({ title: `Access code ${c.code} created`, body: `${n} ${n === 1 ? 'seat' : 'seats'} · ${role === 'officer' ? 'officer' : 'member business'}`, tone: 'success' });
      onCreate(c);
    } catch (err) {
      setError(messageOf(err, 'Could not create the code.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 border-t border-line px-5 py-5 sm:px-6">
      <Field label="Label" hint="Who or where it’s for — only admins see this.">
        {(id) => (
          <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Downtown business association · October" maxLength={120} required autoFocus />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Joins as">
          {(id) => (
            <Select id={id} value={role} onChange={(e) => pickRole(e.target.value as CodeRole)}>
              <option value="business">Member business</option>
              <option value="officer">Public-safety officer</option>
            </Select>
          )}
        </Field>
        <Field label="Seats">
          {(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={1000} value={seats} onChange={(e) => setSeats(e.target.value)} />}
        </Field>
        <Field label="Expires">
          {(id) => (
            <Select id={id} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
              {EXPIRY.map((x, i) => (
                <option key={x.label} value={i}>
                  {x.days ? `In ${x.label}` : x.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      {role === 'officer' && (
        <Banner tone="warning" icon={<TriangleAlert className="h-4 w-4" />} title="Officer codes open officer tools">
          Anyone with this code becomes an officer: they see every report, internal notes and contact details. Share it privately,
          keep seats low and set an expiry.
        </Banner>
      )}
      <Field label="Custom code" optional hint="Leave blank for a random code like K7QM-2XRT.">
        {(id) => (
          <Input id={id} value={custom} onChange={(e) => setCustom(e.target.value.toUpperCase())} placeholder="DTMEMPHIS-OCT" maxLength={32} className="font-mono" />
        )}
      </Field>
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} icon={<Ticket className="h-4 w-4" />}>
          Create code
        </Button>
      </div>
    </form>
  );
}

// ── Code row ──────────────────────────────────────────────────────────────────

function CodeRow({ c, now, onQr, onRevoke }: { c: AccessCode; now: number; onQr: () => void; onRevoke: () => void }) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const status = codeStatus(c, now);
  const pct = Math.min(100, Math.round((c.uses / c.maxUses) * 100));
  const usable = status === 'active';
  return (
    <li className="px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyText(c.code, push, 'Code copied')}
              className="rounded-md font-mono text-[15px] font-bold tracking-[0.08em] text-ink hover:text-accent-strong"
              title="Copy code"
            >
              {c.code}
            </button>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TONE[status])}>{STATUS_LABEL[status]}</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                c.role === 'officer' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-accent-soft text-accent-strong',
              )}
            >
              {c.role === 'officer' ? 'Officer' : 'Business'}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink-2 wrap-anywhere">{c.label || 'No label'}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className={cn('h-full rounded-full', usable ? 'bg-accent' : 'bg-line-strong')} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[12px] tabular-nums text-muted">
              {c.uses} of {c.maxUses} {c.maxUses === 1 ? 'seat' : 'seats'} used
              {c.expiresAt !== null && status !== 'revoked' && (
                <span className="text-subtle">
                  {' · '}
                  {c.expiresAt > now ? `expires ${relativeTime(c.expiresAt, now)}` : `expired ${timeAgo(c.expiresAt, now)}`}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Copy invite link" size="sm" onClick={() => void copyText(joinLink(c.code), push, 'Invite link copied')} disabled={!usable}>
            <Copy className="h-4 w-4" />
          </IconButton>
          <IconButton label="QR code and printable card" size="sm" onClick={onQr} disabled={!usable}>
            <QrCode className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={`Revoke ${c.code}`}
            size="sm"
            onClick={onRevoke}
            disabled={status === 'revoked'}
            className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Ban className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      {c.redemptions.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-strong hover:underline"
            aria-expanded={open}
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition', open && 'rotate-180')} />
            {c.redemptions.length} {c.redemptions.length === 1 ? 'person' : 'people'} used it
          </button>
          {open && (
            <ul className="mt-2 space-y-1.5 rounded-xl bg-surface-2 p-3">
              {c.redemptions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                  <span className="min-w-0 truncate font-medium text-ink">{r.email}</span>
                  <span className="text-muted">
                    {r.outcome === 'upgraded' ? 'raised to this role' : r.outcome === 'existing' ? 'already a member' : r.joined ? 'joined' : 'invited — not signed in yet'}
                    {' · '}
                    {timeAgo(r.createdAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function AccessCodesCard({ m }: { m: Membership }) {
  const now = useNow();
  const { push } = useToast();
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState<AccessCode | null>(null);
  const [revoking, setRevoking] = useState<AccessCode | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await m.revokeCode(revoking.id);
      push({ title: `${revoking.code} revoked`, body: 'Nobody new can join with it. People who already joined keep their access.', tone: 'success' });
      setRevoking(null);
    } catch (err) {
      push({ title: 'Couldn’t revoke the code', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const active = m.codes.filter((c) => codeStatus(c, now) === 'active').length;

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          icon={<Ticket className="h-[18px] w-[18px]" />}
          title="Access codes"
          subtitle="One code, many seats. Share it in person, by email or as a QR card — each person joins with their own email."
          action={
            <div className="flex items-center gap-1">
              <IconButton label="Refresh codes" size="sm" onClick={m.refresh}>
                <RefreshCw className="h-4 w-4" />
              </IconButton>
              {!creating && (
                <span className="hidden sm:block">
                  <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                    New code
                  </Button>
                </span>
              )}
            </div>
          }
        />
        {!creating && (
          // Phones: a full-width button, so the description keeps its width.
          <div className="sm:hidden">
            <Button block icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New code
            </Button>
          </div>
        )}
        {m.codes.length > 0 && (
          <p className="mt-3 text-[12px] text-muted">
            {active} active · {m.codes.reduce((n, c) => n + c.uses, 0)} people joined by code
          </p>
        )}
      </div>

      {creating && (
        <NewCodeForm
          createCode={m.createCode}
          onCancel={() => setCreating(false)}
          onCreate={(c) => {
            setCreating(false);
            setQr(c);
          }}
        />
      )}

      {m.error && (
        <div className="px-5 pb-4 sm:px-6">
          <Banner tone="danger" title="Couldn’t load access codes">
            {m.error}
          </Banner>
        </div>
      )}

      {m.loading ? (
        <ListSkeleton rows={2} />
      ) : m.codes.length === 0 ? (
        <EmptyState
          compact
          icon={<KeyRound className="h-6 w-6" />}
          title="No access codes yet"
          body="Create one for a business association meeting, a block of storefronts or a new officer."
          className="border-t border-line"
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {m.codes.map((c) => (
            <CodeRow key={c.id} c={c} now={now} onQr={() => setQr(c)} onRevoke={() => setRevoking(c)} />
          ))}
        </ul>
      )}

      <AccessCodeQr code={qr} onClose={() => setQr(null)} />
      <Dialog
        open={revoking !== null}
        onClose={() => !busy && setRevoking(null)}
        size="sm"
        icon={<Ban className="h-5 w-5" />}
        title={`Revoke ${revoking?.code ?? ''}?`}
        description={revoking?.label || undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void revoke()}>
              Revoke code
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-2">
          Nobody new can join with this code. The {revoking?.uses ?? 0} {revoking?.uses === 1 ? 'person' : 'people'} who already used it keep
          their access — change roles on the Team tab if needed.
        </p>
      </Dialog>
    </Card>
  );
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

function WaitlistCard({ m, inviteOnly }: { m: Membership; inviteOnly: boolean }) {
  const now = useNow();
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, kind: 'business' | 'officer' | 'dismiss', who: string) => {
    setBusy(`${id}:${kind}`);
    try {
      if (kind === 'dismiss') {
        await m.dismissRequest(id);
        push({ title: 'Request dismissed', body: who, tone: 'success' });
      } else {
        await m.approveRequest(id, kind);
        push({ title: 'Approved — invitation sent', body: `${who} joins as ${kind === 'officer' ? 'an officer' : 'a member business'}.`, tone: 'success' });
      }
    } catch (err) {
      push({ title: 'Couldn’t update the request', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          icon={<Inbox className="h-[18px] w-[18px]" />}
          title="Requests to join"
          subtitle={inviteOnly ? 'People without a code ask here. Approving emails them a one-tap link.' : 'Shown at /join while sign-up is invite-only.'}
        />
      </div>
      {m.loading ? (
        <ListSkeleton rows={1} />
      ) : m.waitlist.length === 0 ? (
        <EmptyState compact icon={<Inbox className="h-6 w-6" />} title="No open requests" body="New requests appear here." className="border-t border-line" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {m.waitlist.map((w) => (
            <li key={w.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">
                  {w.name || w.email}
                  {w.organization && <span className="font-normal text-muted"> · {w.organization}</span>}
                </p>
                <span className="text-[12px] text-subtle">{timeAgo(w.createdAt, now)}</span>
              </div>
              <p className="text-[12px] text-muted wrap-anywhere">{w.email}</p>
              {w.note && <p className="mt-2 rounded-xl bg-surface-2 p-3 text-[13px] text-ink-2">{w.note}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" icon={<Check className="h-4 w-4" />} loading={busy === `${w.id}:business`} disabled={busy !== null} onClick={() => void act(w.id, 'business', w.email)}>
                  Approve as business
                </Button>
                <Button size="sm" variant="secondary" loading={busy === `${w.id}:officer`} disabled={busy !== null} onClick={() => void act(w.id, 'officer', w.email)}>
                  Approve as officer
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} loading={busy === `${w.id}:dismiss`} disabled={busy !== null} onClick={() => void act(w.id, 'dismiss', w.email)}>
                  Dismiss
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function WhoCanJoinCard({ s }: { s: Settings }) {
  const { settings, save, loaded } = s;
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const inviteOnly = settings.signupMode === 'invite';

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await save({ signupMode: next ? 'invite' : 'open' });
      push({
        title: next ? 'Sign-up is now invite-only' : 'Sign-up is open',
        body: next ? 'New accounts need an access code or an invitation.' : 'Anyone can create a business account again.',
        tone: 'success',
      });
    } catch (err) {
      push({ title: 'Couldn’t change sign-up', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={<DoorOpen className="h-[18px] w-[18px]" />} title="Who can join" />
      <div className="mt-4 space-y-3">
        <Switch
          checked={inviteOnly}
          onChange={(v) => void toggle(v)}
          disabled={busy || !loaded}
          label="Invite-only sign-up"
          description={
            inviteOnly
              ? 'New accounts need an access code or an invitation. Others can ask to join at /join.'
              : 'Anyone can create a business account. Codes still give a role and mark how people joined.'
          }
        />
        <p className="flex items-start gap-2 text-[12px] leading-snug text-muted">
          <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Members who already have an account can always sign in. Officers still join only by invitation or an officer code.
        </p>
      </div>
    </Card>
  );
}

function PublicMapCard({ s }: { s: Settings }) {
  const { settings, save, loaded } = s;
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const update = async (patch: Parameters<typeof save>[0], title: string) => {
    setBusy(true);
    try {
      await save(patch);
      push({ title, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t change the public map', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<MapIcon className="h-[18px] w-[18px]" />}
        title="Public live map"
        action={
          <Link to="/live" className="text-[13px] font-semibold text-accent-strong hover:underline">
            Open
          </Link>
        }
      />
      <div className="mt-4 space-y-4">
        <Switch
          checked={settings.publicMapEnabled}
          onChange={(v) => void update({ publicMapEnabled: v }, v ? 'Public map is on' : 'Public map is off')}
          disabled={busy || !loaded}
          label="Show recent reports to the public"
          description="At /live, without signing in."
        />
        <Field label="Delay before a report appears" hint="A delay keeps live responses from being broadcast.">
          {(id) => (
            <Select
              id={id}
              value={settings.publicMapDelayMinutes}
              disabled={busy || !loaded || !settings.publicMapEnabled}
              onChange={(e) => void update({ publicMapDelayMinutes: Number(e.target.value) }, 'Public map delay saved')}
            >
              {DELAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'No delay' : d < 60 ? `${d} minutes` : `${d / 60} hour${d === 60 ? '' : 's'}`}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="rounded-xl bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
          Shows only reports shared with the community, from the last 48 hours: category, priority, status and time, on a ~100 m
          grid. Never shows people or vehicle descriptions, photos, notes, contact details or who reported.
        </p>
      </div>
    </Card>
  );
}

/** Admin → Access: codes, requests, who can join, public map. */
export default function AccessPanel() {
  // One shared state for every card: a code created in the form shows up in the list.
  const m = useMembership();
  const s = useAppSettings();
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="min-w-0 space-y-6">
        <AccessCodesCard m={m} />
        <WaitlistCard m={m} inviteOnly={s.settings.signupMode === 'invite'} />
      </div>
      <div className="min-w-0 space-y-6">
        <WhoCanJoinCard s={s} />
        <PublicMapCard s={s} />
      </div>
    </div>
  );
}
