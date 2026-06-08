import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import {
  listPasskeys,
  registerPasskey,
  deletePasskey,
  passkeysSupported,
} from '../lib/passkeys';
import type { PasskeyInfo } from '../types';
import { useTheme } from '../context/ThemeContext';
import { formatRelative } from '../utils/helpers';

export default function PasskeyManager() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
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
    void refresh();
  }, [refresh]);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await registerPasskey();
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Could not add passkey: ${err.message}`
          : 'Passkey setup was cancelled.',
      );
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
    return (
      <p className={`fluid-text-sm ${dark ? 'text-neutral-500' : 'text-neutral-500'}`}>
        This device or browser doesn’t support passkeys. Use the email sign-in link instead.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
          Sign in instantly with Face ID, Touch ID, or your device PIN.
        </p>
        <button
          onClick={add}
          disabled={busy}
          className={`tap-target flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold fluid-text-sm transition-all flex-shrink-0 ${
            dark ? 'bg-gold-500 hover:bg-gold-400 text-navy-900' : 'bg-navy-600 hover:bg-navy-700 text-white'
          } ${busy ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add passkey
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-neutral-500 fluid-text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading passkeys…
        </div>
      ) : items.length === 0 ? (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border border-dashed ${
            dark ? 'border-white/10 text-neutral-500' : 'border-neutral-200 text-neutral-400'
          }`}
        >
          <KeyRound className="w-5 h-5 flex-shrink-0" />
          <p className="fluid-text-sm">No passkeys yet. Add one to skip the email link next time.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((pk) => (
            <li
              key={pk.id}
              className={`flex items-center gap-3 p-3 rounded-xl ${
                dark ? 'bg-white/5' : 'bg-neutral-50'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  dark ? 'bg-gold-500/15 text-gold-400' : 'bg-navy-50 text-navy-600'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="fluid-text-sm font-medium truncate">{pk.device_label || 'Passkey'}</p>
                <p className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                  Added {formatRelative(new Date(pk.created_at).getTime())}
                  {pk.last_used_at && ` · used ${formatRelative(new Date(pk.last_used_at).getTime())}`}
                </p>
              </div>
              <button
                onClick={() => remove(pk.id)}
                disabled={removing === pk.id}
                className={`tap-target p-2 rounded-lg flex-shrink-0 transition-colors ${
                  dark ? 'hover:bg-red-500/15 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-neutral-400 hover:text-red-500'
                }`}
                aria-label="Remove passkey"
              >
                {removing === pk.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
