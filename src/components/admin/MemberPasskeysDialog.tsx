import { useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, Mail, ShieldCheck, Trash2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { apiFetch } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { messageOf } from '../account/util';
import { Button, IconButton } from '../ui/Button';
import { Banner } from '../ui/Feedback';
import { Dialog } from '../ui/Overlay';
import { memberName, type TeamMember } from './team';

interface Passkey {
  id: string;
  device_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

/**
 * A member's passkeys: see them, remove one, or email a one-tap setup link
 * (WebAuthn can't create a passkey on a device you don't hold).
 */
export default function MemberPasskeysDialog({
  member,
  isDemo,
  onClose,
}: {
  member: TeamMember | null;
  isDemo: boolean;
  onClose: () => void;
}) {
  const now = useNow();
  const { push } = useToast();
  // The parent mounts this per member (key={member.id}), so state starts fresh.
  const [items, setItems] = useState<Passkey[] | null>(() =>
    isDemo
      ? [{ id: 'demo-pk', device_label: 'iPhone · Safari', created_at: new Date(Date.now() - 9 * 86_400_000).toISOString(), last_used_at: new Date(Date.now() - 2 * 3_600_000).toISOString() }]
      : null,
  );
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!member || isDemo) return;
    let active = true;
    apiFetch<{ passkeys: Passkey[] }>('/api/admin/members', { method: 'POST', json: { action: 'passkeys.list', userId: member.id } })
      .then((r) => {
        if (active) setItems(r.passkeys);
      })
      .catch((err: unknown) => {
        if (active) setError(messageOf(err, 'Could not load passkeys.'));
      });
    return () => {
      active = false;
    };
  }, [member, isDemo]);

  if (!member) return null;
  const name = memberName(member);

  const remove = async (id: string) => {
    setBusy(id);
    try {
      if (!isDemo) await apiFetch('/api/admin/members', { method: 'POST', json: { action: 'passkeys.remove', userId: member.id, passkeyId: id } });
      setItems((prev) => (prev ?? []).filter((p) => p.id !== id));
      setConfirm(null);
      push({ title: 'Passkey removed', body: `${name} can still sign in with an email link.`, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t remove the passkey', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const sendSetupLink = async () => {
    setBusy('link');
    try {
      if (!isDemo) await apiFetch('/api/admin/members', { method: 'POST', json: { action: 'passkeys.setupLink', userId: member.id } });
      push({ title: 'Setup link sent', body: `${member.email ?? name} can add a passkey in one tap.`, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t send the link', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open
      onClose={() => busy === null && onClose()}
      size="sm"
      icon={<KeyRound className="h-5 w-5" />}
      title={`Passkeys · ${name}`}
      description={member.email ?? undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
            Close
          </Button>
          <Button icon={<Mail className="h-4 w-4" />} loading={busy === 'link'} disabled={busy !== null && busy !== 'link'} onClick={() => void sendSetupLink()}>
            Email setup link
          </Button>
        </>
      }
    >
      {error && <Banner tone="danger">{error}</Banner>}
      {items === null && !error ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading passkeys…
        </p>
      ) : items && items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-[13px] text-muted">
          No passkeys. {name} signs in with an email link — send a setup link to add one on their phone or computer.
        </p>
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((pk) => (
            <li key={pk.id} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{pk.device_label || 'Passkey'}</p>
                  <p className="text-[12px] text-muted">
                    Added {timeAgo(new Date(pk.created_at).getTime(), now)}
                    {pk.last_used_at && ` · used ${timeAgo(new Date(pk.last_used_at).getTime(), now)}`}
                  </p>
                </div>
                {confirm !== pk.id && (
                  <IconButton label="Remove passkey" size="sm" onClick={() => setConfirm(pk.id)} disabled={busy !== null}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
              {confirm === pk.id && (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                  <p className="mr-auto text-[12px] text-muted">That device stops signing in by passkey. Sessions stay signed in.</p>
                  <Button size="xs" variant="secondary" onClick={() => setConfirm(null)} disabled={busy === pk.id}>
                    Keep
                  </Button>
                  <Button size="xs" variant="danger" loading={busy === pk.id} onClick={() => void remove(pk.id)}>
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
