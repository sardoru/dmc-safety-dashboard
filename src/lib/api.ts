import { supabase } from './supabase';

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  /** JSON body — serialized and sent with the correct content-type header. */
  json?: unknown;
  body?: BodyInit | null;
}

/**
 * fetch() wrapper that attaches the current Supabase access token as a Bearer
 * header and unwraps JSON errors into thrown Errors.
 */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { json, headers: hdrs, ...rest } = opts;
  const headers = new Headers(hdrs);

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let body = opts.body ?? undefined;
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(json);
  }

  const res = await fetch(path, { ...rest, headers, body });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const msg =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : typeof parsed === 'string' && parsed
          ? parsed
          : `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as T;
}
