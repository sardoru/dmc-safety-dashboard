import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { apiFetch } from './api';
import { supabase } from './supabase';
import type { PasskeyInfo } from '../types';

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn();
}

export function platformAuthenticatorAvailable(): Promise<boolean> {
  return platformAuthenticatorIsAvailable();
}

/** Enroll a passkey for the currently signed-in user (Touch ID / Face ID / etc.). */
export async function registerPasskey(deviceLabel?: string): Promise<void> {
  const optionsJSON = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
    '/api/passkeys/register/options',
    { method: 'POST', json: {} },
  );
  const attestation = await startRegistration({ optionsJSON });
  await apiFetch('/api/passkeys/register/verify', {
    method: 'POST',
    json: { attestation, deviceLabel: deviceLabel || guessDeviceLabel() },
  });
}

/**
 * Sign in with a passkey. If `email` is provided we scope the allowed
 * credentials to that account; otherwise the browser offers any resident
 * passkey for this site (usernameless / Apple Passkey).
 */
export async function loginWithPasskey(email?: string): Promise<void> {
  const optionsJSON = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
    '/api/passkeys/auth/options',
    { method: 'POST', json: { email: email?.trim().toLowerCase() } },
  );
  const assertion = await startAuthentication({ optionsJSON });
  const { access_token, refresh_token } = await apiFetch<{
    access_token: string;
    refresh_token: string;
  }>('/api/passkeys/auth/verify', {
    method: 'POST',
    json: { assertion, email: email?.trim().toLowerCase() },
  });
  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
}

export async function listPasskeys(): Promise<PasskeyInfo[]> {
  const { data, error } = await supabase
    .from('passkeys')
    .select('id, device_label, created_at, last_used_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PasskeyInfo[];
}

export async function deletePasskey(id: string): Promise<void> {
  const { error } = await supabase.from('passkeys').delete().eq('id', id);
  if (error) throw error;
}

function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Apple device (iOS)';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android device';
  if (/Windows/.test(ua)) return 'Windows device';
  return 'This device';
}
