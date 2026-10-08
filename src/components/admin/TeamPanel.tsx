import InviteOfficerCard from './InviteOfficerCard';
import PendingInvitesCard from './PendingInvitesCard';
import TeamMembersCard from './TeamMembersCard';
import type { TeamState } from './useTeam';

interface TeamPanelProps {
  team: TeamState;
  isDemo: boolean;
  currentUserId: string | null;
  currentEmail: string | null;
}

/** Admin › Team: invite, pending invitations, and the current officers. */
export default function TeamPanel({ team, isDemo, currentUserId, currentEmail }: TeamPanelProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="min-w-0 space-y-5">
        <InviteOfficerCard
          isDemo={isDemo}
          members={team.members}
          invites={team.invites}
          currentEmail={currentEmail}
          onChanged={team.refresh}
        />
        <PendingInvitesCard
          invites={team.invites}
          loading={team.loading}
          isDemo={isDemo}
          onRevoked={team.dropInvite}
        />
      </div>
      <div className="min-w-0">
        <TeamMembersCard
          members={team.members}
          loading={team.loading}
          refreshing={team.refreshing}
          error={team.error}
          currentUserId={currentUserId}
          isDemo={isDemo}
          onRefresh={team.refresh}
          onRemoved={team.dropMember}
        />
      </div>
    </div>
  );
}
