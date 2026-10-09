import { useState } from 'react';
import { KeyRound, RefreshCw, UserMinus, Users } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useNow } from '../../hooks/useNow';
import { cn, timeAgo } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import EmailText from '../account/EmailText';
import RoleChip from '../account/RoleChip';
import { messageOf } from '../account/util';
import { Button, IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Banner, EmptyState } from '../ui/Feedback';
import { Avatar } from '../ui/Misc';
import { Dialog } from '../ui/Overlay';
import ListSkeleton from './ListSkeleton';
import MemberPasskeysDialog from './MemberPasskeysDialog';
import { memberName, type TeamMember } from './team';

interface TeamMembersCardProps {
  members: TeamMember[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  currentUserId: string | null;
  isDemo: boolean;
  onRefresh: () => void;
  onRemoved: (id: string) => void;
}

function MemberRow({
  member,
  now,
  isYou,
  onRemove,
  onPasskeys,
}: {
  member: TeamMember;
  now: number;
  isYou: boolean;
  onRemove: () => void;
  onPasskeys: () => void;
}) {
  const name = memberName(member);
  const joined = member.joinedAt !== null ? timeAgo(member.joinedAt, now) : null;
  return (
    <li className="flex items-center gap-3 px-5 py-3 sm:px-6">
      <Avatar name={name} className="self-start sm:self-center" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          {isYou && (
            <span className="flex-shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              You
            </span>
          )}
        </div>
        <p className="text-[12px] text-muted wrap-anywhere sm:truncate">
          {member.email ? <EmailText email={member.email} /> : 'No email on file'}
          {joined && <span className="hidden text-subtle sm:inline"> · joined {joined}</span>}
        </p>
        {/* Phones: role + join date on their own line instead of the right-hand column. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
          <RoleChip role={member.role} />
          {joined && <span className="text-[12px] text-subtle">Joined {joined}</span>}
        </div>
      </div>
      <span className="hidden sm:block">
        <RoleChip role={member.role} />
      </span>
      <IconButton label={`Passkeys for ${name}`} size="sm" onClick={onPasskeys} className="self-start sm:self-center">
        <KeyRound className="h-4 w-4" />
      </IconButton>
      <IconButton
        label={isYou ? 'You can’t remove your own access' : `Remove officer access for ${name}`}
        size="sm"
        disabled={isYou}
        onClick={onRemove}
        className="self-start hover:bg-red-50 hover:text-red-600 sm:self-center dark:hover:bg-red-500/10 dark:hover:text-red-400"
      >
        <UserMinus className="h-4 w-4" />
      </IconButton>
    </li>
  );
}

/** Officers and administrators, with "Remove officer access" behind a confirmation. */
export default function TeamMembersCard({
  members,
  loading,
  refreshing,
  error,
  currentUserId,
  isDemo,
  onRefresh,
  onRemoved,
}: TeamMembersCardProps) {
  const now = useNow();
  const { push } = useToast();
  const [confirming, setConfirming] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [passkeysFor, setPasskeysFor] = useState<TeamMember | null>(null);

  const close = () => {
    if (!removing) setConfirming(null);
  };

  const remove = async () => {
    const member = confirming;
    if (!member) return;
    const name = memberName(member);
    if (isDemo) {
      setConfirming(null);
      push({
        title: 'Simulated in demo',
        body: `${name} keeps their access — team changes aren’t saved in demo mode.`,
        tone: 'info',
      });
      return;
    }
    setRemoving(true);
    try {
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'business' })
        .eq('id', member.id)
        .select('id');
      if (updateError) throw updateError;
      // Row-level security turns a disallowed update into a silent no-op.
      if (!data?.length) throw new Error('No change was saved — check that your account is still an administrator.');
      onRemoved(member.id);
      setConfirming(null);
      push({ title: 'Officer access removed', body: `${name} now has a regular business account.`, tone: 'success' });
    } catch (err) {
      push({ title: 'Couldn’t remove access', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    } finally {
      setRemoving(false);
    }
  };

  const confirmName = confirming ? memberName(confirming) : '';

  return (
    <Card padded={false}>
      <div className="p-5 pb-0 sm:p-6 sm:pb-0">
        <CardHeader
          icon={<Users className="h-[18px] w-[18px]" />}
          title="Officers & administrators"
          subtitle={
            isDemo
              ? 'Sample team — changes are simulated in demo mode.'
              : 'Everyone with access to the Operations Center.'
          }
          action={
            !isDemo && (
              <IconButton label="Refresh team" size="sm" onClick={onRefresh} disabled={refreshing || loading}>
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              </IconButton>
            )
          }
        />
      </div>

      {error && (
        <div className="px-5 pb-4 sm:px-6">
          <Banner
            tone="danger"
            title="Couldn’t load the team"
            action={
              <Button size="xs" variant="secondary" onClick={onRefresh}>
                Retry
              </Button>
            }
          >
            {error}
          </Banner>
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={3} />
      ) : members.length === 0 ? (
        <EmptyState
          compact
          icon={<Users className="h-6 w-6" />}
          title="No officers yet"
          body="Invite your first Public Safety officer to start working reports together."
          className="border-t border-line"
        />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              now={now}
              isYou={m.id === currentUserId}
              onRemove={() => setConfirming(m)}
              onPasskeys={() => setPasskeysFor(m)}
            />
          ))}
        </ul>
      )}

      {passkeysFor && (
        <MemberPasskeysDialog key={passkeysFor.id} member={passkeysFor} isDemo={isDemo} onClose={() => setPasskeysFor(null)} />
      )}
      <Dialog
        open={confirming !== null}
        onClose={close}
        size="sm"
        icon={<UserMinus className="h-5 w-5" />}
        title="Remove officer access?"
        description={confirming?.email ?? undefined}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" loading={removing} onClick={() => void remove()}>
              Remove access
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{confirmName}</span> will be switched to a regular business account and
          lose access to the Operations Center, Insights and officer tools. You can invite them again at any time.
        </p>
      </Dialog>
    </Card>
  );
}
