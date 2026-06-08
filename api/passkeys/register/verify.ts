import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { getUser } from '../../_lib/auth';
import { getAdmin } from '../../_lib/supabaseAdmin';
import { rpInfo, bytesToB64url } from '../../_lib/webauthn';
import { sendError, sendJson, methodNotAllowed, readBody } from '../../_lib/http';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ['POST'])) return;

  const user = await getUser(req);
  if (!user) return sendError(res, 401, 'Not authenticated');

  const { attestation, deviceLabel } = readBody<{
    attestation?: RegistrationResponseJSON;
    deviceLabel?: string;
  }>(req);
  if (!attestation) return sendError(res, 400, 'Missing attestation');

  const { rpID, origin } = rpInfo(req);
  const admin = getAdmin();

  const { data: challengeRow } = await admin
    .from('webauthn_challenges')
    .select('id, challenge')
    .eq('user_id', user.id)
    .eq('type', 'registration')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challengeRow) return sendError(res, 400, 'Registration session expired — try again');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: challengeRow.challenge as string,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return sendError(res, 400, err instanceof Error ? err.message : 'Verification failed');
  }

  if (!verification.verified || !verification.registrationInfo) {
    return sendError(res, 400, 'Passkey could not be verified');
  }

  const { credential } = verification.registrationInfo;

  const { error } = await admin.from('passkeys').insert({
    user_id: user.id,
    credential_id: credential.id,
    public_key: bytesToB64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    device_label: deviceLabel || 'Passkey',
  });
  if (error) {
    if (error.code === '23505') return sendError(res, 409, 'This passkey is already registered');
    return sendError(res, 500, 'Could not save passkey');
  }

  await admin.from('webauthn_challenges').delete().eq('id', challengeRow.id);

  return sendJson(res, 200, { verified: true });
}
