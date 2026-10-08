import { PhoneCall } from 'lucide-react';
import { cn } from '../../lib/format';

/** The "this is an emergency — call 911" strip. */
export default function EmergencyCallout({ className, loud }: { className?: string; loud?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3',
        loud
          ? 'animate-slide-up border-red-600 bg-red-600 text-white shadow-lg shadow-red-600/25'
          : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200',
        className,
      )}
      role={loud ? 'alert' : undefined}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold">{loud ? 'Someone may be in danger — call 911 now.' : 'Is anyone in danger right now?'}</p>
        <p className={cn('text-[12px] leading-snug', loud ? 'text-white/85' : 'opacity-80')}>
          {loud ? 'Then finish this report so downtown officers have the details.' : 'Call 911 first. This dashboard alerts downtown public safety, not emergency dispatch.'}
        </p>
      </div>
      <a
        href="tel:911"
        className={cn(
          'inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold',
          loud ? 'bg-white text-red-700 hover:bg-red-50' : 'bg-red-600 text-white hover:bg-red-700',
        )}
      >
        <PhoneCall className="h-4 w-4" /> 911
      </a>
    </div>
  );
}
