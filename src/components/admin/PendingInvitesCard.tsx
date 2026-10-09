import { useState } from 'react';
import { Hourglass, Mail } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { timeAgo } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import EmailText from '../account/EmailText';
import { messageOf } from '../account/util';
import { ROLE_LABEL } from '../layout/nav';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import ListSkeleton from './ListSkeleton';
import { roleNoun, type PendingInvite } from './team';

interface PendingInvitesCardProps {
  invites: PendingInvite[];
  loading: boolean;
  isDemo: boolean;
  onRevoked: (id: string) => void;
}

/** Invitations that haven't been accepted yet, each revocable. */
export default function PendingInvitesCard({ invites, loading, isDemo, onRevoked }: PendingInvitesCardProps) {
  const now = useNow();
  const { push } = useToast();
  const [revoking, setRevoking] = useState<string | null>(null);

  const revoke = async (invite: PendingInvite) => {
    if (isDemo) {
      push({
        title: 'Simulated in demo',
        body: `The invitation for ${invite.email} stays as it is — nothing changes in demo mode.`,
        tone: 'info',
      });
      return;
    }
    setRevoking(invite.id);
    try {
      const { data, error } = await supabase.from('officer_invites').delete().eq('id', invite.id).select('id');
      if (error) throw error;
      // Row-level security turns a disallowed delete into a silent no-op.
      if (!data?.length) throw new Error('The invitation was already accepted or removed. Refresh to see the latest.');
      onRevoked(invite.id);
      push({
        title: 'Invitation revoked',
        body:
          invite.role === 'business'
            ? `${invite.email} can no longer join with this invitation.`
            : `${invite.email} won’t be made ${roleNoun(invite.role)} when they sign in.`,
        tone: 'success',
      });
    } catch (err) {
      push({ title: 'Couldn’t revoke the invitation', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card padded={false}>
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardHeader
          icon={<Hourglass className="h-[18px] w-[18px]" />}
          title="Pending invites"
          subtitle="Sent, but not accepted yet."
          action={
            !loading &&
            invites.length > 0 && (
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted tabular">
                {invites.length}
              </span>
            )
          }
        />
      </div>

      {loading ? (
        <ListSkeleton rows={1} />
      ) : invites.length === 0 ? (
        <p className="border-t border-line px-5 py-5 text-[13px] leading-relaxed text-muted sm:px-6">
          No invitations waiting. New invites show up here until they’re accepted.
        </p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted">
                <Mail className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink wrap-anywhere sm:truncate">
                  <EmailText email={inv.email} />
                </p>
                <p className="text-[12px] text-muted">
                  {ROLE_LABEL[inv.role]} · invited {timeAgo(inv.invitedAt, now)}
                </p>
              </div>
              <Button
                size="xs"
                variant="ghost"
                loading={revoking === inv.id}
                onClick={() => void revoke(inv)}
                aria-label={`Revoke the invitation for ${inv.email}`}
                className="flex-shrink-0"
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
