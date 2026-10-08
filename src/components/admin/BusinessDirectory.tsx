import { useMemo, useState } from 'react';
import { MapPin, Search, Store } from 'lucide-react';
import type { Business } from '../../types';
import { businessTypeMeta } from '../account/businessTypes';
import { telHref } from '../account/util';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/Feedback';
import { Input } from '../ui/Form';

const COLUMNS = 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.1fr)]';

function searchText(b: Business): string {
  return [b.name, b.address, businessTypeMeta(b.type).label, b.contactName, b.phone, b.email].join(' ').toLowerCase();
}

function BusinessRow({ business: b }: { business: Business }) {
  const meta = businessTypeMeta(b.type);
  const TypeIcon = meta.icon;
  return (
    <li className="flex items-start gap-3 px-5 py-3.5 sm:px-6 lg:items-center">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
        <TypeIcon className="h-4 w-4" aria-hidden />
      </span>
      <div className={`grid min-w-0 flex-1 gap-1.5 lg:items-center lg:gap-4 ${COLUMNS}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
          <p className="truncate text-[12px] text-muted">{meta.label}</p>
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-subtle" aria-hidden />
          <span className="truncate">{b.address || 'No address on file'}</span>
        </p>
        <div className="min-w-0 text-[13px]">
          <p className="truncate text-ink-2">
            {b.contactName || <span className="text-subtle">No contact name</span>}
            {b.phone && (
              <>
                <span className="text-subtle"> · </span>
                <a href={telHref(b.phone)} className="text-muted tabular hover:text-ink hover:underline">
                  {b.phone}
                </a>
              </>
            )}
          </p>
          {b.email && (
            <p className="truncate text-[12px]">
              <a href={`mailto:${b.email}`} className="text-muted hover:text-ink hover:underline">
                {b.email}
              </a>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/** Admin › Businesses: every registered storefront, searchable. */
export default function BusinessDirectory({ businesses }: { businesses: Business[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const sorted = useMemo(() => [...businesses].sort((a, b) => a.name.localeCompare(b.name)), [businesses]);
  const results = useMemo(() => (q ? sorted.filter((b) => searchText(b).includes(q)) : sorted), [sorted, q]);

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            Member businesses
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-muted tabular">
              {businesses.length}
            </span>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted" aria-live="polite">
            {q
              ? `${results.length} of ${businesses.length} match “${query.trim()}”`
              : 'Storefronts registered on the dashboard. Officers see them on the map.'}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, street, contact…"
            aria-label="Search businesses"
            className="pl-9"
          />
        </div>
      </div>

      {businesses.length === 0 ? (
        <EmptyState
          className="border-t border-line"
          illustration="illoCommunity"
          icon={<Store className="h-6 w-6" />}
          title="No businesses yet"
          body="When downtown businesses sign up and register their storefront, they’ll appear here."
        />
      ) : results.length === 0 ? (
        <EmptyState
          compact
          className="border-t border-line"
          icon={<Search className="h-6 w-6" />}
          title="No matches"
          body={`Nothing matches “${query.trim()}”. Try a street name, a contact or a business type.`}
          action={
            <Button size="sm" variant="secondary" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <>
          <div
            className={`hidden gap-4 border-t border-line bg-surface-2 py-2 pl-[72px] pr-6 text-[11px] font-semibold uppercase tracking-wide text-subtle lg:grid ${COLUMNS}`}
            aria-hidden
          >
            <span>Business</span>
            <span>Address</span>
            <span>Contact</span>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {results.map((b) => (
              <BusinessRow key={b.id} business={b} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
