import { MessageSquare, Phone, PhoneCall } from 'lucide-react';
import { cn } from '../lib/format';

const CONTACTS = [
  { name: 'Emergency — police, fire, EMS', number: '911', href: 'tel:911', urgent: true },
  { name: 'MPD non-emergency', number: '(901) 545-2677', href: 'tel:+19015452677' },
  { name: 'Downtown security line', number: '(901) 575-0540', href: 'tel:+19015750540' },
  { name: 'Memphis Fire Department', number: '(901) 320-5507', href: 'tel:+19013205507' },
  { name: 'Crisis Text Line', number: 'Text HOME to 741741', href: 'sms:741741&body=HOME', sms: true },
];

/** Phone numbers that matter downtown. */
export default function EmergencyContacts({ className }: { className?: string }) {
  return (
    <ul className={cn('space-y-2', className)}>
      {CONTACTS.map((c) => (
        <li key={c.name}>
          <a
            href={c.href}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
              c.urgent
                ? 'border-red-200 bg-red-50 hover:bg-red-100 dark:border-red-500/25 dark:bg-red-500/10 dark:hover:bg-red-500/15'
                : 'border-line bg-surface hover:bg-surface-2',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg',
                c.urgent ? 'bg-red-600 text-white' : 'bg-surface-3 text-ink-2',
              )}
            >
              {c.sms ? <MessageSquare className="h-4 w-4" /> : c.urgent ? <PhoneCall className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className={cn('block truncate text-[13px] font-semibold', c.urgent ? 'text-red-700 dark:text-red-300' : 'text-ink')}>
                {c.name}
              </span>
              <span className="block text-[12px] text-muted tabular">{c.number}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
