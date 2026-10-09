import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ban, Copy, ExternalLink, Monitor, Plus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import { supabaseConfigured } from '../../lib/supabase';
import { timeAgo } from '../../lib/format';
import { messageOf } from '../account/util';
import { Button, IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input } from '../ui/Form';
import { Dialog } from '../ui/Overlay';

interface DisplayLink {
  id: string;
  label: string;
  created_at: string;
  last_seen_at: string | null;
}

/** The link a TV opens: the key rides in the #fragment, so it never reaches server logs or Referer headers. */
const displayUrl = (key: string | null) => `${window.location.origin}/tv${key ? `#key=${key}` : ''}`;

async function copy(text: string, push: ReturnType<typeof useToast>['push']) {
  try {
    await navigator.clipboard.writeText(text);
    push({ title: 'Link copied', body: 'Open it on the wall screen’s browser.', tone: 'success' });
  } catch {
    window.prompt('Copy this link', text);
  }
}

/**
 * Admin → Access → Wall displays: private links for a TV on an office wall (/tv). Each link shows the live map and
 * the latest reports — never reporters, contact details, descriptions or photos. Its key is shown once; revoking
 * stops the screen within 15 seconds.
 */
export default function DisplayLinksCard() {
  const isDemo = !supabaseConfigured;
  const { push } = useToast();
  const now = useNow();
  const [list, setList] = useState<DisplayLink[] | null>(isDemo ? [] : null);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState('Office wall');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ label: string; url: string } | null>(null);
  const [revoking, setRevoking] = useState<DisplayLink | null>(null);

  const load = useCallback(() => {
    if (isDemo) return;
    apiFetch<{ displays: DisplayLink[] }>('/api/admin/members', { method: 'POST', json: { action: 'displays.list' } })
      .then((r) => setList(r.displays))
      .catch(() => setList([]));
  }, [isDemo]);
  useEffect(load, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    try {
      if (isDemo) {
        // Demo: the wall display shows the sample data, no key needed.
        setFresh({ label: name, url: displayUrl(null) });
      } else {
        const r = await apiFetch<{ display: DisplayLink; key: string }>('/api/admin/members', {
          method: 'POST',
          json: { action: 'displays.create', label: name },
        });
        setList((l) => [r.display, ...(l ?? [])]);
        setFresh({ label: r.display.label, url: displayUrl(r.key) });
      }
      setCreating(false);
    } catch (err) {
      push({ title: 'Couldn’t create the display link', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    setBusy(true);
    try {
      await apiFetch('/api/admin/members', { method: 'POST', json: { action: 'displays.revoke', id: revoking.id } });
      setList((l) => (l ?? []).filter((d) => d.id !== revoking.id));
      push({ title: 'Display link revoked', body: `“${revoking.label}” stops updating within 15 seconds.`, tone: 'success' });
      setRevoking(null);
    } catch (err) {
      push({ title: 'Couldn’t revoke the link', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Monitor className="h-[18px] w-[18px]" />}
        title="Wall displays"
        action={
          !creating && (
            <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              New link
            </Button>
          )
        }
      />
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        A private link for a TV on an office wall: the live map and the latest reports, refreshed every 15 seconds. It never
        shows who reported, contact details, descriptions or photos.
      </p>

      {creating && (
        <form onSubmit={(e) => void create(e)} className="mt-4 space-y-3 rounded-2xl border border-line bg-surface-2 p-3">
          <Field label="Name" hint="Where the screen is — only admins see this.">
            {(id) => <Input id={id} value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Office wall" autoFocus />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={busy} disabled={!label.trim()}>
              Create link
            </Button>
          </div>
        </form>
      )}

      <ul className="mt-4 divide-y divide-line">
        {list === null ? (
          <li className="py-3 text-[13px] text-muted">Loading…</li>
        ) : list.length === 0 ? (
          <li className="py-3 text-[13px] text-muted">{isDemo ? 'Demo: a wall display shows the sample data.' : 'No wall displays yet.'}</li>
        ) : (
          list.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5">
              <Monitor className="h-4 w-4 flex-shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{d.label}</p>
                <p className="text-[12px] text-muted">
                  Made {timeAgo(new Date(d.created_at).getTime(), now)} ·{' '}
                  {d.last_seen_at ? `on screen ${timeAgo(new Date(d.last_seen_at).getTime(), now)}` : 'not opened yet'}
                </p>
              </div>
              <IconButton label={`Revoke ${d.label}`} onClick={() => setRevoking(d)}>
                <Ban className="h-4 w-4" />
              </IconButton>
            </li>
          ))
        )}
      </ul>

      <Dialog
        open={Boolean(fresh)}
        onClose={() => setFresh(null)}
        icon={<Monitor className="h-5 w-5" />}
        title={`Display link · ${fresh?.label ?? ''}`}
        description={isDemo ? 'Demo: this opens the wall display with the sample data.' : 'Copy it now — it’s shown only once.'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon={<ExternalLink className="h-4 w-4" />} onClick={() => fresh && window.open(fresh.url, '_blank', 'noopener')}>
              Open
            </Button>
            <Button icon={<Copy className="h-4 w-4" />} onClick={() => fresh && void copy(fresh.url, push)}>
              Copy link
            </Button>
          </div>
        }
      >
        <p className="break-all rounded-xl bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink">{fresh?.url}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Open it in the wall screen’s browser and choose Full screen. Anyone with this link sees the wall — keep it on that screen,
          and revoke it here if it leaks.
        </p>
      </Dialog>

      <Dialog
        open={Boolean(revoking)}
        onClose={() => setRevoking(null)}
        icon={<Ban className="h-5 w-5" />}
        title={`Revoke “${revoking?.label ?? ''}”?`}
        description="The screen stops updating within 15 seconds. Make a new link to show the wall again."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void revoke()}>
              Revoke link
            </Button>
          </div>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">Anyone who copied this link can’t use it after this.</p>
      </Dialog>
    </Card>
  );
}
