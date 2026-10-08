import { useMemo, useState } from 'react';
import { useIncidents } from '../context/IncidentContext';
import { useNow } from '../hooks/useNow';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import { Segmented } from '../components/ui/Form';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/Feedback';
import { computeInsights, RANGE_ORDER, RANGES, type RangeKey } from '../components/insights/metrics';
import { VIZ_THEME } from '../components/insights/viz';
import KpiRow from '../components/insights/KpiRow';
import ReportsOverTimeCard from '../components/insights/ReportsOverTime';
import HeatmapCard from '../components/insights/Heatmap';
import { CategoryCard, HotspotsCard, SourceCard, StatusCard } from '../components/insights/Breakdowns';
import InsightsSkeleton from '../components/insights/InsightsSkeleton';

export default function Insights() {
  const { incidents, loading } = useIncidents();
  const now = useNow();
  const [range, setRange] = useState<RangeKey>('7d');
  const data = useMemo(() => computeInsights(incidents, range, now), [incidents, range, now]);
  const meta = RANGES[range];
  const longer = RANGE_ORDER[RANGE_ORDER.indexOf(range) + 1];

  return (
    <PageContainer wide className={VIZ_THEME}>
      <PageHeader
        eyebrow="Analytics"
        title="Insights"
        description="How reports are trending downtown — volume and urgency, how fast officers respond, and where and when incidents are reported."
        actions={
          <Segmented<RangeKey>
            label="Time range"
            value={range}
            onChange={setRange}
            options={RANGE_ORDER.map((k) => ({ value: k, label: RANGES[k].option }))}
          />
        }
      />

      {loading ? (
        <InsightsSkeleton />
      ) : data.total === 0 ? (
        <Card>
          <EmptyState
            illustration="illoAllClear"
            title={`No reports in ${meta.phrase}`}
            body={
              data.openNow
                ? `Nothing new came in during this window. ${data.openNow} earlier ${data.openNow === 1 ? 'report is' : 'reports are'} still open in the Operations Center.`
                : 'Nothing came in during this window. Try a longer range to see trends.'
            }
            action={
              longer ? (
                <Button variant="secondary" onClick={() => setRange(longer)}>
                  Show {RANGES[longer].phrase}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <KpiRow data={data} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            <ReportsOverTimeCard
              className="md:col-span-2 xl:col-span-4"
              buckets={data.buckets}
              rangeKey={range}
              unit={meta.unit}
              totals={data.priorityTotals}
              now={now}
            />
            <StatusCard
              className="xl:col-span-2"
              statuses={data.statuses}
              openByPriority={data.openByPriority}
              total={data.total}
            />
            <SourceCard className="xl:col-span-2" reporters={data.reporters} channels={data.channels} total={data.total} />
            <HeatmapCard className="md:col-span-2 xl:col-span-4" heat={data.heat} />
            <CategoryCard className="xl:col-span-3" categories={data.categories} total={data.total} />
            <HotspotsCard className="xl:col-span-3" hotspots={data.hotspots} now={now} />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
