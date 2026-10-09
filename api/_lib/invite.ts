import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedUser, Role } from './auth.js';
import { sendEmail } from './emails.js';
import { invitationEmail, type InviteAccount } from './invitations.js';
import { audit, grantRole, hasSignedIn, signInLink } from './membership.js';

/**
 * One administrator's invitation to one address — the same steps whether it comes from Admin → Team →
 * Invite someone (`/api/officers/invite`) or from the paced list (`/api/cron/invites`):
 *
 * Never lowers anyone. A new address gets a pending invite — or its open one is raised (or kept, when
 * it's already higher) — and the invitation email for the role it carries (`invited`). An existing
 * account is raised right away (`granted`) or keeps an equal or higher role (`unchanged`); either way it
 * gets a sign-in link and the guide for the role it has. An account that has never signed in (its first
 * invite unopened) gets the invitation again (`invited`). Any failed lookup or write throws before an
 * email goes out.
 */

/** Who the invitation comes from. */
export interface Inviter {
  /** The administrator: recorded on the invite and in the audit log. */
  actor: AuthedUser;
  /** The name the email shows ("Sgt. R. Delgado invited you…"); null reads "An administrator…". */
  name: string | null;
}

export type InviteStatus = 'invited' | 'granted' | 'unchanged';

export type InviteResult =
  /** Done. `emailed: false` only for an existing account whose sign-in link couldn't be made. */
  | { kind: 'done'; status: InviteStatus; role: Role; emailed: boolean }
  /** A new address, but no sign-in link could be made: its pending invite stays, nothing was emailed. */
  | { kind: 'no-link'; role: Role; error: string }
  /** `beforeSend` said no: nothing was emailed or recorded as sent. */
  | { kind: 'stopped'; role: Role };

export interface InviteOptions {
  /** `queue`: sent from the paced list — its audit entries carry `via: 'queue'`. */
  via?: 'queue';
  /** Passed to the email service: the same key within 24 hours is delivered once. */
  idempotencyKey?: string;
  /** Asked right before the email goes out; false stops here (the paced list: cancelled or paused). */
  beforeSend?: () => Promise<boolean>;
}

/** Validate before calling: `email` normalized (normalizeEmail), `role` parsed (parseRole). */
export async function inviteByEmail(
  admin: SupabaseClient,
  email: string,
  role: Role,
  from: Inviter,
  opts: InviteOptions = {},
): Promise<InviteResult> {
  const via = opts.via ? { via: opts.via } : {};
  const grant = await grantRole(admin, email, role, { source: 'admin', invitedBy: from.actor.id });

  if (grant.raisedFrom) {
    await audit(admin, from.actor, 'member.role_granted', email, { from: grant.raisedFrom, to: grant.role, ...via });
    // Record the (already-claimed) invite.
    const { error: clearError } = await admin.from('officer_invites').delete().eq('email', email).eq('status', 'pending');
    if (clearError) throw new Error(clearError.message);
    const { error: recordError } = await admin.from('officer_invites').insert({
      email,
      role: grant.role,
      status: 'claimed',
      invited_by: from.actor.id,
      claimed_at: new Date().toISOString(),
    });
    if (recordError) throw new Error(recordError.message);
  }

  const existing = grant.accountId !== null;
  const firstTime = grant.accountId === null || !(await hasSignedIn(admin, grant.accountId));
  const account: InviteAccount = firstTime ? 'new' : grant.raisedFrom ? 'raised' : 'existing';
  const status: InviteStatus = firstTime ? 'invited' : grant.raisedFrom ? 'granted' : 'unchanged';

  let url: string;
  try {
    url = await signInLink(admin, email, existing);
  } catch (err) {
    if (existing) return { kind: 'done', status, role: grant.role, emailed: false };
    return { kind: 'no-link', role: grant.role, error: err instanceof Error ? err.message : 'Could not generate invitation link' };
  }
  if (opts.beforeSend && !(await opts.beforeSend())) return { kind: 'stopped', role: grant.role };
  const message = invitationEmail({ role: grant.role, source: 'admin', account, email, url, inviterName: from.name });
  if (opts.idempotencyKey) await sendEmail(email, message, { idempotencyKey: opts.idempotencyKey });
  else await sendEmail(email, message);
  if (!grant.raisedFrom) {
    await audit(admin, from.actor, 'invite.sent', email, {
      role: grant.role,
      ...(existing ? { existing: true } : {}),
      ...(grant.role !== role ? { requested: role } : {}),
      ...via,
    });
  }
  return { kind: 'done', status, role: grant.role, emailed: true };
}
