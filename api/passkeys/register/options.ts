import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getUser } from '../../_lib/auth';
import { getAdmin } from '../../_lib/supabaseAdmin';
import { rpInfo } from '../../_lib/webauthn';
import { sendError, sendJson, methodNotAllowed } from '../../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const user = await getUser(req);
  if (!user) return sendError(res, 401, 'Not authenticated');

  const { rpID, rpName } = rpInfo(req);
  const admin = getAdmin();

  const { data: existing } = await admin
    .from('passkeys')
    .select('credential_id, transports')
    .eq('user_id', user.id);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email || user.id,
    userID: new TextEncoder().encode(user.id),
    attestationType: 'none',
    excludeCredentials: (existing ?? []).map((p) => ({
      id: p.credential_id as string,
      transports: (p.transports as AuthenticatorTransportFuture[]) ?? undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Replace any prior registration challenge for this user.
  await admin
    .from('webauthn_challenges')
    .delete()
    .eq('user_id', user.id)
    .eq('type', 'registration');
  const { error } = await admin.from('webauthn_challenges').insert({
    user_id: user.id,
    challenge: options.challenge,
    type: 'registration',
  });
  if (error) return sendError(res, 500, 'Could not start passkey registration');

  return sendJson(res, 200, options);
}
