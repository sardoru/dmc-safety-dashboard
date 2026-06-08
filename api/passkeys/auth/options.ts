import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getAdmin } from '../../_lib/supabaseAdmin';
import { rpInfo } from '../../_lib/webauthn';
import { sendError, sendJson, methodNotAllowed, readBody } from '../../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const { email } = readBody<{ email?: string }>(req);
  const { rpID } = rpInfo(req);
  const admin = getAdmin();

  // Scope to a specific account's credentials when an email is supplied;
  // otherwise allow any resident passkey (usernameless / Apple Passkey).
  let allowCredentials:
    | { id: string; transports?: AuthenticatorTransportFuture[] }[]
    | undefined;

  if (email) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    if (profile) {
      const { data: keys } = await admin
        .from('passkeys')
        .select('credential_id, transports')
        .eq('user_id', profile.id);
      allowCredentials = (keys ?? []).map((k) => ({
        id: k.credential_id as string,
        transports: (k.transports as AuthenticatorTransportFuture[]) ?? undefined,
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    allowCredentials,
  });

  // Opportunistic cleanup + store the new challenge.
  await admin
    .from('webauthn_challenges')
    .delete()
    .eq('type', 'authentication')
    .lt('expires_at', new Date().toISOString());

  const { error } = await admin.from('webauthn_challenges').insert({
    email: email?.toLowerCase() ?? null,
    challenge: options.challenge,
    type: 'authentication',
  });
  if (error) return sendError(res, 500, 'Could not start passkey sign-in');

  return sendJson(res, 200, options);
}
