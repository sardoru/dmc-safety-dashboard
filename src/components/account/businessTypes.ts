import type { LucideIcon } from 'lucide-react';
import { BedDouble, Building2, Martini, ShoppingBag, Store, UtensilsCrossed, Wrench } from 'lucide-react';
import type { BusinessType } from '../../types';

export interface BusinessTypeMeta {
  value: BusinessType;
  label: string;
  icon: LucideIcon;
}

export const BUSINESS_TYPES: BusinessTypeMeta[] = [
  { value: 'restaurant', label: 'Restaurant / café', icon: UtensilsCrossed },
  { value: 'retail', label: 'Retail shop', icon: ShoppingBag },
  { value: 'office', label: 'Office / lobby', icon: Building2 },
  { value: 'bar', label: 'Bar / venue', icon: Martini },
  { value: 'hotel', label: 'Hotel', icon: BedDouble },
  { value: 'service', label: 'Service business', icon: Wrench },
  { value: 'other', label: 'Other', icon: Store },
];

const BY_VALUE = new Map(BUSINESS_TYPES.map((t) => [t.value, t]));
const OTHER = BUSINESS_TYPES[BUSINESS_TYPES.length - 1];

export function isBusinessType(value: string): value is BusinessType {
  return BY_VALUE.has(value as BusinessType);
}

export function businessTypeMeta(type: string): BusinessTypeMeta {
  return BY_VALUE.get(type as BusinessType) ?? OTHER;
}
