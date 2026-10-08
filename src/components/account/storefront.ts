import type { BusinessType, UserProfile } from '../../types';
import { isEmail } from './util';

/** The editable part of a business storefront. */
export interface StorefrontForm {
  businessName: string;
  address: string;
  businessType: BusinessType;
  contactName: string;
  phone: string;
  email: string;
}

export type StorefrontErrors = Partial<Record<keyof StorefrontForm, string>>;

export function formFromProfile(p: UserProfile): StorefrontForm {
  return {
    businessName: p.businessName,
    address: p.address,
    businessType: p.businessType,
    contactName: p.contactName,
    phone: p.phone,
    email: p.email,
  };
}

export function blankForm(defaults: { contactName?: string; email?: string } = {}): StorefrontForm {
  return {
    businessName: '',
    address: '',
    businessType: 'other',
    contactName: defaults.contactName ?? '',
    phone: '',
    email: defaults.email ?? '',
  };
}

export function trimForm(f: StorefrontForm): StorefrontForm {
  return {
    ...f,
    businessName: f.businessName.trim(),
    address: f.address.trim(),
    contactName: f.contactName.trim(),
    phone: f.phone.trim(),
    email: f.email.trim(),
  };
}

export function validateForm(f: StorefrontForm): StorefrontErrors {
  const errors: StorefrontErrors = {};
  if (!f.businessName) errors.businessName = 'Enter your business name.';
  if (!f.address) errors.address = 'Enter your street address so officers can place you on the map.';
  if (f.phone && f.phone.replace(/\D/g, '').length < 7) errors.phone = 'Enter a phone number officers can call.';
  if (f.email && !isEmail(f.email)) errors.email = 'Enter a valid email address.';
  return errors;
}

/** Same street address, ignoring case, punctuation and spacing. */
export function sameAddress(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(a) === norm(b);
}

export function hasPin(p: Pick<UserProfile, 'lat' | 'lng'> | null | undefined): boolean {
  return Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0));
}
