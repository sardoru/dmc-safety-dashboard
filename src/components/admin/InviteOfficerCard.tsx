import { useState, type FormEvent } from 'react';
import { Send, UserPlus } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { isEmail, messageOf } from '../account/util';
import { ROLE_LABEL } from '../layout/nav';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Select } from '../ui/Form';
import { memberName, STAFF_ROLE_HINT, staffRoleNoun, type PendingInvite, type StaffRole, type TeamMember } from './team';

interface InviteResult {
  status: 'granted' | 'invited';
  emailed: boolean;
}

interface InviteOfficerCardProps {
  isDemo: boolean;
  members: TeamMember[];
  invites: PendingInvite[];
  /** The signed-in admin's email — inviting yourself would change your own role. */
  currentEmail: string | null;
  /** Reload the team (also after a failure: the server may have recorded the invite). */
  onChanged: () => void;
}

export default function InviteOfficerCard({ isDemo, members, invites, currentEmail, onChanged }: InviteOfficerCardProps) {
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('officer');
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
    if (existing && existing.role === role) {
      setError(`${memberName(existing)} already has ${ROLE_LABEL[role]} access.`);
      return;
    }
    setError('');

    if (isDemo) {
      push({
        title: 'Invites are simulated in demo',
        body: `On the connected dashboard, ${address} would get a secure sign-in link by email. Nothing was sent.`,
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
      if (result.status === 'granted') {
        push({
          title: existing ? 'Access updated' : 'Access granted',
          body: `${address} is now ${staffRoleNoun(role)}. ${
            result.emailed ? 'We emailed them a sign-in link.' : 'They can sign in with their email as usual.'
          }`,
          tone: 'success',
        });
      } else {
        push({
          title: resend ? 'Invitation re-sent' : 'Invitation sent',
          body: `${address} will join as ${staffRoleNoun(role)} once they accept the email.`,
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
        title="Invite an officer"
        subtitle="They’ll get a branded email with a secure sign-in link."
      />
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field label="Work email" error={error || undefined}>
          {(id) => (
            <Input
              id={id}
              type="email"
              inputMode="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="name@downtownmemphis.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              aria-invalid={error ? true : undefined}
            />
          )}
        </Field>
        <Field label="Role" hint={STAFF_ROLE_HINT[role]}>
          {(id) => (
            <Select id={id} value={role} onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'officer')}>
              <option value="officer">Public Safety officer</option>
              <option value="admin">Administrator</option>
            </Select>
          )}
        </Field>
        <Button type="submit" block loading={sending} icon={<Send className="h-4 w-4" />}>
          Send invite
        </Button>
        <p className="text-[12px] leading-relaxed text-subtle">
          {isDemo
            ? 'Demo mode: invites are simulated and no email is sent.'
            : 'If they already have an account, their access is upgraded right away.'}
        </p>
      </form>
    </Card>
  );
}
