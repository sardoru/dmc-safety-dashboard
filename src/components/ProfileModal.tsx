import { useState } from 'react';
import { Building2, X, MapPin, Loader2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { generateId } from '../utils/helpers';
import type { BusinessType, UserProfile } from '../types';

const businessTypes: { value: BusinessType; label: string }[] = [
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'retail', label: 'Retail' },
  { value: 'office', label: 'Office' },
  { value: 'bar', label: 'Bar / Entertainment' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
];

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { theme } = useTheme();
  const { profile, setProfile } = useProfile();
  const dark = theme === 'dark';

  const [form, setForm] = useState({
    businessName: profile?.businessName ?? '',
    address: profile?.address ?? '',
    businessType: (profile?.businessType ?? 'restaurant') as BusinessType,
    contactName: profile?.contactName ?? '',
    phone: profile?.phone ?? '',
    email: profile?.email ?? '',
  });
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const update = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setError('');
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Memphis, TN')}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!form.businessName || !form.address || !form.contactName) {
      setError('Please fill in all required fields.');
      return;
    }

    setGeocoding(true);
    const coords = await geocodeAddress(form.address);
    setGeocoding(false);

    const lat = coords?.lat ?? 35.1495 + (Math.random() - 0.5) * 0.005;
    const lng = coords?.lng ?? -90.049 + (Math.random() - 0.5) * 0.005;

    const newProfile: UserProfile = {
      id: profile?.id ?? generateId(),
      businessName: form.businessName,
      address: form.address,
      businessType: form.businessType,
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      lat,
      lng,
      registeredAt: profile?.registeredAt ?? Date.now(),
    };

    setProfile(newProfile);
    onClose();
  };

  const inputClass = `
    w-full px-3 py-2.5 rounded-xl outline-none fluid-text-sm tap-target
    ${dark
      ? 'bg-white/5 text-neutral-200 placeholder:text-neutral-600 border border-white/10 focus:border-gold-500/50'
      : 'bg-neutral-50 text-neutral-700 placeholder:text-neutral-400 border border-neutral-200 focus:border-navy-400'
    }
  `;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className={`
        relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl animate-slide-up
        ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-2xl'}
      `}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-white/10' : 'border-neutral-100'}`}>
          <div className="flex items-center gap-2">
            <Building2 className={`w-5 h-5 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
            <h2 className="font-bold fluid-text-lg">{profile ? 'Edit Profile' : 'Register Your Business'}</h2>
          </div>
          <button
            onClick={onClose}
            className={`tap-target p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 text-red-500 fluid-text-sm">
              {error}
            </div>
          )}

          <div>
            <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Business Name *
            </label>
            <input
              type="text"
              value={form.businessName}
              onChange={e => update('businessName', e.target.value)}
              placeholder="e.g., Memphis Coffee House"
              className={inputClass}
            />
          </div>

          <div>
            <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Address *
            </label>
            <div className="relative">
              <input
                type="text"
                value={form.address}
                onChange={e => update('address', e.target.value)}
                placeholder="e.g., 123 Main St, Memphis, TN 38103"
                className={inputClass}
              />
              <MapPin className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dark ? 'text-neutral-600' : 'text-neutral-400'}`} />
            </div>
          </div>

          <div>
            <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Business Type
            </label>
            <select
              value={form.businessType}
              onChange={e => update('businessType', e.target.value)}
              className={inputClass}
            >
              {businessTypes.map(bt => (
                <option key={bt.value} value={bt.value}>{bt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
              Contact Name *
            </label>
            <input
              type="text"
              value={form.contactName}
              onChange={e => update('contactName', e.target.value)}
              placeholder="Your full name"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Phone
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="(901) 555-0123"
                className={inputClass}
              />
            </div>
            <div>
              <label className={`block mb-1.5 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                placeholder="you@business.com"
                className={inputClass}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={geocoding}
            className={`
              w-full tap-target py-3.5 rounded-xl font-bold fluid-text-base transition-all flex items-center justify-center gap-2
              ${dark
                ? 'bg-gold-500 hover:bg-gold-400 text-navy-900'
                : 'bg-navy-600 hover:bg-navy-700 text-white'
              }
              ${geocoding ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'}
            `}
          >
            {geocoding && <Loader2 className="w-4 h-4 animate-spin" />}
            {geocoding ? 'Locating address...' : profile ? 'Update Profile' : 'Register Business'}
          </button>
        </div>
      </div>
    </div>
  );
}
