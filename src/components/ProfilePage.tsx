import { Building2, Edit3, LogOut, MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { formatDateTime } from '../utils/helpers';
import ProfileModal from './ProfileModal';
import EmergencyContacts from './EmergencyContacts';

export default function ProfilePage() {
  const { theme } = useTheme();
  const { profile, setProfile } = useProfile();
  const [editing, setEditing] = useState(false);
  const dark = theme === 'dark';

  if (!profile) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 rounded-xl ${dark ? 'card-dark' : 'card-light'}`}>
        <Building2 className={`w-12 h-12 mb-4 ${dark ? 'text-neutral-600' : 'text-neutral-300'}`} />
        <h2 className="font-bold fluid-text-lg mb-2">No Business Registered</h2>
        <p className={`fluid-text-sm text-center mb-6 max-w-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
          Register your downtown Memphis business to receive alerts and participate in the safety network.
        </p>
        <button
          onClick={() => setEditing(true)}
          className={`tap-target px-6 py-3 rounded-xl font-bold fluid-text-sm transition-all ${dark ? 'bg-gold-500 text-navy-900 hover:bg-gold-400' : 'bg-navy-600 text-white hover:bg-navy-700'}`}
        >
          Register Your Business
        </button>
        <ProfileModal isOpen={editing} onClose={() => setEditing(false)} />
      </div>
    );
  }

  const fields = [
    { icon: <MapPin className="w-4 h-4" />, label: 'Address', value: profile.address },
    { icon: <Building2 className="w-4 h-4" />, label: 'Type', value: profile.businessType.charAt(0).toUpperCase() + profile.businessType.slice(1) },
    { icon: <Phone className="w-4 h-4" />, label: 'Phone', value: profile.phone || 'Not set' },
    { icon: <Mail className="w-4 h-4" />, label: 'Email', value: profile.email || 'Not set' },
    { icon: <Clock className="w-4 h-4" />, label: 'Registered', value: formatDateTime(profile.registeredAt) },
  ];

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden ${dark ? 'card-dark' : 'card-light'}`}>
      <div className={`px-4 py-3 border-b ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className={`w-4 h-4 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
            <h2 className="font-semibold fluid-text-sm">Business Profile</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditing(true)}
              className={`tap-target p-2 rounded-lg transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
              title="Edit profile"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to remove your registration?')) {
                  setProfile(null);
                }
              }}
              className={`tap-target p-2 rounded-lg transition-colors text-red-500 ${dark ? 'hover:bg-red-500/10' : 'hover:bg-red-50'}`}
              title="Unregister"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className={`p-4 rounded-xl ${dark ? 'bg-gold-500/5 border border-gold-500/10' : 'bg-navy-50 border border-navy-100'}`}>
          <h3 className={`font-bold fluid-text-lg ${dark ? 'text-gold-400' : 'text-navy-600'}`}>
            {profile.businessName}
          </h3>
          <p className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            {profile.contactName}
          </p>
        </div>

        <div className="space-y-2">
          {fields.map(f => (
            <div
              key={f.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${dark ? 'bg-white/[0.02]' : 'bg-neutral-50/70'}`}
            >
              <span className={dark ? 'text-neutral-500' : 'text-neutral-400'}>{f.icon}</span>
              <div className="flex-1 min-w-0">
                <div className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>{f.label}</div>
                <div className={`fluid-text-sm font-medium truncate ${dark ? 'text-neutral-200' : 'text-neutral-700'}`}>{f.value}</div>
              </div>
            </div>
          ))}
        </div>

        <EmergencyContacts />
      </div>

      <ProfileModal isOpen={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
