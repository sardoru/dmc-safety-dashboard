import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Building2, History, Hourglass, Server, Ticket, TriangleAlert, Users } from 'lucide-react';
import AccessPanel from '../components/admin/AccessPanel';
import ActivityPanel from '../components/admin/ActivityPanel';
import BusinessDirectory from '../components/admin/BusinessDirectory';
import SystemPanel from '../components/admin/SystemPanel';
import TeamPanel from '../components/admin/TeamPanel';
import { countIssues, systemHealth } from '../components/admin/systemHealth';
import { useLiveSessionStatus } from '../components/admin/useLiveSessionStatus';
import { useTeam } from '../components/admin/useTeam';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import { Segmented } from '../components/ui/Form';
import { Stat } from '../components/ui/Misc';
import { useAuth } from '../context/AuthContext';
import { useIncidents } from '../context/IncidentContext';
import { RADIO_BRIDGE_ENABLED, useRadio } from '../context/RadioContext';
import { useVoice } from '../context/VoiceContext';
import { useBusinesses } from '../hooks/useBusinesses';
import { useNow } from '../hooks/useNow';
import { plural } from '../lib/format';
import { isOpen } from '../lib/taxonomy';

type Tab = 'team' | 'access' | 'businesses' | 'activity' | 'system';

const TAB_LABEL: Record<Tab, string> = {
  team: 'Team',
  access: 'Access',
  businesses: 'Businesses',
  activity: 'Activity',
  system: 'System',
};

function parseTab(value: string | null): Tab {
  return value === 'access' || value === 'businesses' || value === 'activity' || value === 'system' ? value : 'team';
}

const DAY_MS = 86_400_000;

export default function AdminPortal() {
  const { isDemo, userId, email } = useAuth();
  const { incidents, caps } = useIncidents();
  const { info } = useVoice();
  const { wsStatus, isLive } = useRadio();
  const businesses = useBusinesses();
  const team = useTeam();
  const live = useLiveSessionStatus(!isDemo);
  const now = useNow();

  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const setTab = (next: Tab) => setParams(next === 'team' ? {} : { tab: next }, { replace: true });

  const lastDay = useMemo(() => {
    const recent = incidents.filter((i) => i.createdAt >= now - DAY_MS);
    return { total: recent.length, open: recent.filter((i) => isOpen(i.status)).length };
  }, [incidents, now]);

  const health = systemHealth({
    isDemo,
    caps,
    live,
    tts: info,
    radio: { enabled: RADIO_BRIDGE_ENABLED, wsStatus, isLive },
  });
  const issues = countIssues(health);
  const admins = team.members.filter((m) => m.role === 'admin').length;

  const tabOptions: { value: Tab; label: ReactNode; icon?: ReactNode; count?: number }[] = [
    {
      value: 'team',
      label: TAB_LABEL.team,
      icon: <Users className="hidden h-3.5 w-3.5 sm:block" aria-hidden />,
      count: team.loading ? undefined : team.members.length,
    },
    {
      value: 'access',
      label: TAB_LABEL.access,
      icon: <Ticket className="hidden h-3.5 w-3.5 sm:block" aria-hidden />,
    },
    {
      value: 'businesses',
      label: TAB_LABEL.businesses,
      icon: <Building2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden />,
      count: businesses.length,
    },
    {
      value: 'activity',
      label: TAB_LABEL.activity,
      icon: <History className="hidden h-3.5 w-3.5 sm:block" aria-hidden />,
    },
    {
      value: 'system',
      label: (
        <>
          {TAB_LABEL.system}
          {issues > 0 && <span className="sr-only">, {plural(issues, 'integration')} need attention</span>}
        </>
      ),
      icon:
        issues > 0 ? (
          <TriangleAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
        ) : (
          <Server className="hidden h-3.5 w-3.5 sm:block" aria-hidden />
        ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Team, access & system"
        description="Invite officers, hand out access codes, approve requests to join, review member businesses and check every integration."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Officers"
          icon={<Users className="h-3.5 w-3.5" />}
          value={team.loading ? '—' : team.members.length}
          hint={team.loading ? 'Loading…' : admins > 0 ? `Includes ${plural(admins, 'admin')}` : 'No administrators'}
        />
        <Stat
          label="Businesses"
          icon={<Building2 className="h-3.5 w-3.5" />}
          value={businesses.length}
          hint="Registered storefronts"
        />
        <Stat
          label="Pending invites"
          icon={<Hourglass className="h-3.5 w-3.5" />}
          value={team.loading ? '—' : team.invites.length}
          tone={!team.loading && team.invites.length > 0 ? 'accent' : 'default'}
          hint={team.invites.length > 0 ? 'Awaiting first sign-in' : 'None outstanding'}
        />
        <Stat
          label="Reports · 24h"
          icon={<Activity className="h-3.5 w-3.5" />}
          value={lastDay.total}
          hint={
            lastDay.total === 0 ? 'None in the last day' : lastDay.open > 0 ? `${lastDay.open} still open` : 'All closed'
          }
        />
      </div>

      <div className="no-scrollbar -mx-1 mb-5 overflow-x-auto px-1">
        {/* Phones: compact and without counts, so all five sections fit. */}
        <div className="sm:hidden">
          <Segmented<Tab>
            size="sm"
            value={tab}
            onChange={setTab}
            label="Administration sections"
            options={tabOptions.map((o) => ({ ...o, count: undefined }))}
          />
        </div>
        <div className="hidden sm:block">
          <Segmented<Tab> value={tab} onChange={setTab} label="Administration sections" options={tabOptions} />
        </div>
      </div>

      <div role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {tab === 'team' && <TeamPanel team={team} isDemo={isDemo} currentUserId={userId} currentEmail={email} />}
        {tab === 'access' && <AccessPanel />}
        {tab === 'businesses' && <BusinessDirectory businesses={businesses} />}
        {tab === 'activity' && <ActivityPanel />}
        {tab === 'system' && <SystemPanel health={health} live={live} />}
      </div>
    </PageContainer>
  );
}
