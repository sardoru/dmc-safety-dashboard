import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { getAdmin } from '../../_lib/supabaseAdmin.js';
import { mintSession } from '../../_lib/auth.js';
import { rpInfo, b64urlToBytes, challengeFromAssertion } from '../../_lib/webauthn.js';
import { sendError, sendJson, methodNotAllowed, readBody } from '../../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const { assertion } = readBody<{ assertion?: AuthenticationResponseJSON }>(req);
  if (!assertion?.id) return sendError(res, 400, 'Missing assertion');

  const challenge = challengeFromAssertion(assertion);
  if (!challenge) return sendError(res, 400, 'Malformed assertion');

  const { rpID, origin } = rpInfo(req);
  const admin = getAdmin();

  // Confirm we issued this challenge and it hasn't expired.
  const { data: challengeRow } = await admin
    .from('webauthn_challenges')
    .select('id')
    .eq('challenge', challenge)
    .eq('type', 'authentication')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!challengeRow) return sendError(res, 400, 'Sign-in session expired — try again');

  // Identify the passkey + its owner.
  const { data: passkey } = await admin
    .from('passkeys')
    .select('id, user_id, public_key, counter, transports')
    .eq('credential_id', assertion.id)
    .maybeSingle();
  if (!passkey) return sendError(res, 400, 'Unknown passkey');

  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', passkey.user_id)
    .maybeSingle();
  if (!profile?.email) return sendError(res, 400, 'Account is missing an email');

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: assertion.id,
        publicKey: b64urlToBytes(passkey.public_key as string),
        counter: Number(passkey.counter ?? 0),
        transports: (passkey.transports as AuthenticatorTransportFuture[]) ?? undefined,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    return sendError(res, 400, err instanceof Error ? err.message : 'Verification failed');
  }

  if (!verification.verified) return sendError(res, 400, 'Passkey could not be verified');

  await admin
    .from('passkeys')
    .update({
      counter: verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    })
    .eq('id', passkey.id);

  await admin.from('webauthn_challenges').delete().eq('id', challengeRow.id);

  try {
    const session = await mintSession(profile.email);
    return sendJson(res, 200, session);
  } catch (err) {
    return sendError(res, 500, err instanceof Error ? err.message : 'Could not create session');
  }
}
