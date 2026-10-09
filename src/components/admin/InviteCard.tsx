import { useState, type FormEvent } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import type { Role } from '../../types';
import { isEmail, messageOf } from '../account/util';
import { ROLE_LABEL } from '../layout/nav';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Form';
import { INVITE_ROLES, memberName, ROLE_HINT, ROLE_RANK, roleNoun, type PendingInvite, type TeamMember } from './team';

interface InviteResult {
  /** invited: a new address · granted: an existing account was raised · unchanged: it already had this role or a higher one. */
  status: 'granted' | 'invited' | 'unchanged';
  /** The role they have now (an invitation never lowers one). */
  role?: Role;
  emailed: boolean;
}

interface InviteCardProps {
  isDemo: boolean;
  members: TeamMember[];
  invites: PendingInvite[];
  /** The signed-in admin's email — inviting yourself would change your own role. */
  currentEmail: string | null;
  /** Reload the team (also after a failure: the server may have recorded the invite). */
  onChanged: () => void;
}

function asRole(value: string): Role {
  return value === 'admin' || value === 'officer' ? value : 'business';
}

/** Admin › Team: invite a member business, a Public Safety officer or an administrator by email. */
export default function InviteCard({ isDemo, members, invites, currentEmail, onChanged }: InviteCardProps) {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  // Least access first: a slip of the picker should never hand out officer tools.
  const [role, setRole] = useState<Role>('business');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!isEmail(address)) {
      setError('Enter a valid email address.');
      return;
    }
    if (currentEmail && address === currentEmail.toLowerCase()) {
      setError('That’s your own account — ask another administrator to change your role.');
      return;
    }
    const existing = members.find((m) => m.email?.toLowerCase() === address);
    if (existing && ROLE_RANK[existing.role] >= ROLE_RANK[role]) {
      setError(
        existing.role === role
          ? `${memberName(existing)} already has ${ROLE_LABEL[role]} access.`
          : `${memberName(existing)} is already ${roleNoun(existing.role)} — an invitation never lowers a role.`,
      );
      return;
    }
    setError('');

    if (isDemo) {
      push({
        title: 'Invites are simulated in demo',
        body: `On the connected dashboard, ${address} would get the invitation email for ${roleNoun(role)}, with a one-time sign-in link. Nothing was sent.`,
        tone: 'info',
      });
      setEmail('');
      return;
    }

    const resend = invites.some((i) => i.email.toLowerCase() === address);
    setSending(true);
    try {
      const result = await apiFetch<InviteResult>('/api/officers/invite', {
        method: 'POST',
        json: { email: address, role },
      });
      const now = result.role ?? role;
      const emailed = result.emailed
        ? 'We emailed them a sign-in link and the guide for their role.'
        : 'They can sign in with their email as usual.';
      if (result.status === 'granted') {
        push({
          title: existing ? 'Access updated' : 'Access granted',
          body: `${address} is now ${roleNoun(now)}. ${emailed}`,
          tone: 'success',
        });
      } else if (result.status === 'unchanged') {
        push({
          title: 'Already a member',
          body: `${address} already ${now === role ? `has ${ROLE_LABEL[now]} access` : `is ${roleNoun(now)} — an invitation never lowers a role`}. ${emailed}`,
          tone: 'info',
        });
      } else {
        push({
          title: resend ? 'Invitation re-sent' : 'Invitation sent',
          body: `${address} will join as ${roleNoun(role)} once they open the email.`,
          tone: 'success',
        });
      }
      setEmail('');
    } catch (err) {
      push({ title: 'Couldn’t send the invite', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setSending(false);
      onChanged();
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<UserPlus className="h-[18px] w-[18px]" />}
        title="Invite someone"
        subtitle="They get an email written for their role — what they can do, first steps and the how-to films — with a one-time sign-in link."
      />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Email address" error={error || undefined}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="name@business.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              aria-invalid={error ? true : undefined}
            />
          )}
        </Field>
        <Field label="Invite as" hint={ROLE_HINT[role]}>
          {(id) => (
            <Select
              id={id}
              value={role}
              onChange={(e) => {
                setRole(asRole(e.target.value));
                if (error) setError('');
              }}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" block loading={sending} icon={<Send className="h-4 w-4" />}>
          Send invite
        </Button>
        <p className="text-[12px] leading-relaxed text-subtle">
          {isDemo
            ? 'Demo mode: invites are simulated and no email is sent.'
            : 'Already have an account? Their role is raised right away — never lowered.'}
        </p>
      </form>
    </Card>
  );
}
