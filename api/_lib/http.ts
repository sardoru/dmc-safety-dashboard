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
