import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { deletePasskey, listPasskeys, passkeysSupported, registerPasskey } from '../lib/passkeys';
import type { PasskeyInfo } from '../types';
import { timeAgo } from '../lib/format';
import { useNow } from '../hooks/useNow';
import { Button, IconButton } from './ui/Button';
import { Banner } from './ui/Feedback';

export default function PasskeyManager() {
  const now = useNow();
  const [items, setItems] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setItems(await listPasskeys());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load passkeys.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPasskeys()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load passkeys.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await registerPasskey();
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not add passkey: ${err.message}` : 'Passkey setup was cancelled.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setError('');
    try {
      await deletePasskey(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove passkey.');
    } finally {
      setRemoving(null);
    }
  };

  if (!passkeysSupported()) {
    return <p className="text-sm text-muted">This device or browser doesn’t support passkeys. Use the email sign-in link instead.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] leading-snug text-muted">Sign in instantly with Face ID, Touch ID or your device PIN.</p>
        <Button size="sm" loading={busy} icon={<Plus className="h-4 w-4" />} onClick={() => void add()}>
          Add passkey
        </Button>
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading passkeys…
        </p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-strong p-4 text-muted">
          <KeyRound className="h-5 w-5 flex-shrink-0" />
          <p className="text-[13px]">No passkeys yet. Add one to skip the email link next time.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((pk) => (
            <li key={pk.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
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
              <IconButton label="Remove passkey" size="sm" onClick={() => void remove(pk.id)} disabled={removing === pk.id}>
                {removing === pk.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
