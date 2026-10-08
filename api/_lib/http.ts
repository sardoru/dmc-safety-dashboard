import type { VercelRequest, VercelResponse } from '@vercel/node';

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export function sendError(res: VercelResponse, status: number, error: string): void {
  sendJson(res, status, { error });
}

/**
 * Guard the HTTP method. Returns true and sends a 405 if the method is not
 * allowed, so callers can `if (!allowMethods(...)) return;`.
 */
export function methodNotAllowed(
  req: VercelRequest,
  res: VercelResponse,
  allowed: string[],
): boolean {
  if (req.method && allowed.includes(req.method)) return false;
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, `Method ${req.method} not allowed`);
  return true;
}

/**
 * fetch() that gives up when the upstream hasn't started answering (status +
 * headers) within `ms`, so a slow provider becomes a clear error instead of
 * Vercel's 30 s timeout page. Once the response starts, the body (e.g. an
 * audio stream) is never cut off.
 */
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

/** Body is auto-parsed by Vercel for JSON content-type; this is a safe accessor. */
export function readBody<T = Record<string, unknown>>(req: VercelRequest): T {
  if (req.body && typeof req.body === 'object') return req.body as T;
  if (typeof req.body === 'string' && req.body) {
    try {
      return JSON.parse(req.body) as T;
    } catch {
      return {} as T;
    }
  }
  return {} as T;
}
