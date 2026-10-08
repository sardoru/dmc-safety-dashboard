import { Skeleton } from '../ui/Feedback';
import { cn } from '../../lib/format';

function CardSkeleton({ className, rows = 5, chart }: { className?: string; rows?: number; chart?: boolean }) {
  return (
    <div className={cn('card p-5 sm:p-6', className)}>
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      {chart ? (
        <Skeleton className="h-[230px] w-full rounded-xl" />
      ) : (
        <div className="space-y-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Holds the dashboard's layout while reports load, so nothing jumps. */
export default function InsightsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading insights">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="card space-y-2.5 px-4 py-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <CardSkeleton chart className="md:col-span-2 xl:col-span-4" />
        <CardSkeleton className="xl:col-span-2" />
        <CardSkeleton className="xl:col-span-2" />
        <CardSkeleton chart className="md:col-span-2 xl:col-span-4" />
        <CardSkeleton className="xl:col-span-3" />
        <CardSkeleton className="xl:col-span-3" />
      </div>
    </div>
  );
}
