import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import type { LiveSessionStatus } from './systemHealth';

export interface LiveSessionState extends LiveSessionStatus {
  recheck: () => void;
}

interface Result {
  nonce: number;
  status: LiveSessionStatus;
}

function isLiveInfo(v: unknown): v is { configured: unknown; provider?: unknown; model?: unknown } {
  return typeof v === 'object' && v !== null && 'configured' in v;
}

/** Voice interviewer status from `GET /api/voice-session` (connected deployments only). */
export function useLiveSessionStatus(enabled: boolean): LiveSessionState {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<unknown>('/api/voice-session')
      .then((data) => {
        if (cancelled) return;
        if (!isLiveInfo(data)) {
          // e.g. the SPA fallback answered because the /api functions aren't deployed.
          setResult({
            nonce,
            status: { loading: false, configured: null, error: 'The /api functions didn’t answer — are they deployed?' },
          });
          return;
        }
        setResult({
          nonce,
          status: {
            loading: false,
            configured: data.configured === true,
            provider: data.provider === 'elevenlabs' || data.provider === 'gpt-live' ? data.provider : null,
            model: typeof data.model === 'string' ? data.model : undefined,
          },
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          nonce,
          status: { loading: false, configured: null, error: err instanceof Error ? err.message : 'Request failed' },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  if (!enabled) return { loading: false, configured: null, recheck };
  if (result && result.nonce === nonce) return { ...result.status, recheck };
  return {
    loading: true,
    configured: result?.status.configured ?? null,
    provider: result?.status.provider,
    model: result?.status.model,
    recheck,
  };
}
