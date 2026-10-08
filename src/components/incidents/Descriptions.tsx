import { Car, UserRound } from 'lucide-react';
import type { SubjectDescription, VehicleDescription } from '../../types';

function Row({ label, value }: { label: string; value?: unknown }) {
  // Descriptions are stored as member-written JSON: show text and numbers,
  // skip anything else (an object here would crash the whole view).
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  if (!text) return null;
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-24 flex-shrink-0 text-[12px] text-subtle">{label}</dt>
      <dd className="min-w-0 text-[13px] text-ink">{text}</dd>
    </div>
  );
}

export function SubjectDetails({ subject: s, index }: { subject: SubjectDescription; index: number }) {
  const summary = [s.sex, s.ageRange].filter(Boolean).join(', ');
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <UserRound className="h-4 w-4 text-accent" aria-hidden />
        Person {index + 1}
        {summary && <span className="font-normal text-muted">· {summary}</span>}
      </p>
      <dl>
        <Row label="Height / build" value={[s.height, s.build].filter(Boolean).join(', ')} />
        <Row label="Hair / head" value={s.hair} />
        <Row label="Top" value={s.clothingTop} />
        <Row label="Bottom" value={s.clothingBottom} />
        <Row label="Footwear" value={s.footwear} />
        <Row label="Distinctive" value={s.distinguishing} />
        <Row label="Behavior" value={s.behavior} />
        <Row label="Went" value={s.direction} />
      </dl>
    </div>
  );
}

export function VehicleDetails({ vehicle: v, index }: { vehicle: VehicleDescription; index: number }) {
  const name = [v.color, v.make, v.model].filter(Boolean).join(' ');
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="mb-1 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Car className="h-4 w-4 text-accent" aria-hidden />
        Vehicle {index + 1}
        {name && <span className="font-normal text-muted">· {name}</span>}
      </p>
      <dl>
        <Row label="Type" value={v.bodyType} />
        <Row label="Plate" value={v.plate ? `${v.plate}${v.plateState ? ` (${v.plateState})` : ''}` : undefined} />
        <Row label="Details" value={v.notes} />
        <Row label="Went" value={v.direction} />
      </dl>
    </div>
  );
}
