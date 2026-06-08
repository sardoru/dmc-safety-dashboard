import type { VercelRequest } from '@vercel/node';

export interface RpInfo {
  rpID: string;
  rpName: string;
  origin: string;
}

/** Resolve the WebAuthn relying-party id/origin from env or the request host. */
export function rpInfo(req: VercelRequest): RpInfo {
  const fwdHost = (req.headers['x-forwarded-host'] || req.headers.host || '') as string;
  const host = fwdHost.split(',')[0].trim();
  const proto = ((req.headers['x-forwarded-proto'] as string) || 'https').split(',')[0].trim();
  const rpID = process.env.RP_ID || host.split(':')[0] || 'localhost';
  const origin = process.env.RP_ORIGIN || `${proto}://${host}`;
  return { rpID, rpName: 'DMC Safety Dashboard', origin };
}

export function bytesToB64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, 'base64url');
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

/** Pull the issued challenge back out of an assertion's clientDataJSON. */
export function challengeFromAssertion(assertion: unknown): string | null {
  try {
    const clientDataJSON = (assertion as { response?: { clientDataJSON?: string } })?.response
      ?.clientDataJSON;
    if (!clientDataJSON) return null;
    const json = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as {
      challenge?: string;
    };
    return typeof json.challenge === 'string' ? json.challenge : null;
  } catch {
    return null;
  }
}
