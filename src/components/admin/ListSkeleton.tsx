import { Skeleton } from '../ui/Feedback';

/** Placeholder rows while a list loads. */
export default function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line border-t border-line" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
