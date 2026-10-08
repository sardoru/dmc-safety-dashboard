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

function isLiveInfo(v: unknown): v is { configured: unknown; model?: unknown; voice?: unknown } {
  return typeof v === 'object' && v !== null && 'configured' in v;
}

/** GPT-Live interviewer status from `GET /api/live-session` (connected deployments only). */
export function useLiveSessionStatus(enabled: boolean): LiveSessionState {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<unknown>('/api/live-session')
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
            model: typeof data.model === 'string' ? data.model : undefined,
            voice: typeof data.voice === 'string' ? data.voice : undefined,
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
    model: result?.status.model,
    voice: result?.status.voice,
    recheck,
  };
}
