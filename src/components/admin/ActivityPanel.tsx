import { History, RefreshCw } from 'lucide-react';
import { useNow } from '../../hooks/useNow';
import { timeAgo } from '../../lib/format';
import { IconButton } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Banner, EmptyState } from '../ui/Feedback';
import ListSkeleton from './ListSkeleton';
import { describeAudit } from './membership';
import { useMembership } from './useMembership';

/** Admin → Activity: who changed what — codes, invites, roles, passkeys, settings. */
export default function ActivityPanel() {
  const m = useMembership();
  const now = useNow();
  return (
    <Card padded={false}>
      <div className="p-5 sm:p-6">
        <CardHeader
          icon={<History className="h-[18px] w-[18px]" />}
          title="Activity"
          subtitle="An append-only record of administrative changes. Nobody can edit or delete entries."
          action={
            <IconButton label="Refresh activity" size="sm" onClick={m.refresh}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
          }
        />
      </div>
      {m.error && (
        <div className="px-5 pb-4 sm:px-6">
          <Banner tone="danger" title="Couldn’t load activity">
            {m.error}
          </Banner>
        </div>
      )}
      {m.loading ? (
        <ListSkeleton rows={4} />
      ) : m.audit.length === 0 ? (
        <EmptyState compact icon={<History className="h-6 w-6" />} title="Nothing yet" body="Changes to codes, invites, roles and settings appear here." className="border-t border-line" />
      ) : (
        <ol className="divide-y divide-line border-t border-line">
          {m.audit.map((e) => {
            const d = describeAudit(e);
            return (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
                <p className="min-w-0 text-[13px] text-ink-2">
                  <span className="font-semibold text-ink">{e.actor}</span> {d.verb}
                  {d.target && <span className="font-medium text-ink wrap-anywhere"> {d.target}</span>}
                  {d.detail && <span className="text-muted"> · {d.detail}</span>}
                </p>
                <time className="text-[12px] text-subtle" dateTime={new Date(e.createdAt).toISOString()} title={new Date(e.createdAt).toLocaleString()}>
                  {timeAgo(e.createdAt, now)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
