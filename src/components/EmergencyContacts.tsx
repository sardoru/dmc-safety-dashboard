import { Phone, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

const contacts = [
  { name: 'MPD Emergency', number: '911', tel: '911', priority: true },
  { name: 'MPD Non-Emergency', number: '(901) 545-2677', tel: '+19015452677' },
  { name: 'Downtown Security', number: '(901) 575-0540', tel: '+19015750540' },
  { name: 'Fire Department', number: '(901) 320-5507', tel: '+19013205507' },
  { name: 'Crisis Text Line', number: 'Text HOME to 741741', tel: 'sms:741741&body=HOME', isText: true },
];

export default function EmergencyContacts() {
  const [expanded, setExpanded] = useState(false);
  const { theme } = useTheme();
  const dark = theme === 'dark';

  return (
    <div
      className={`rounded-xl overflow-hidden ${dark ? 'card-dark' : 'card-light'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          w-full tap-target flex items-center justify-between px-4 py-3 transition-colors
          ${dark ? 'hover:bg-white/5' : 'hover:bg-neutral-50'}
        `}
      >
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-red-500" />
          <span className="font-semibold fluid-text-sm">Emergency Contacts</span>
        </div>
        {expanded ? (
          <ChevronUp className={`w-4 h-4 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`} />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 animate-slide-up">
          <div className="space-y-2">
            {contacts.map(c => (
              <a
                key={c.name}
                href={c.isText ? `sms:741741&body=HOME` : `tel:${c.tel}`}
                className={`
                  tap-target flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                  ${c.priority
                    ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20'
                    : dark
                      ? 'bg-white/5 hover:bg-white/10'
                      : 'bg-neutral-50 hover:bg-neutral-100'
                  }
                `}
              >
                <div className={`p-1.5 rounded-lg ${c.priority ? 'bg-red-500 text-white' : dark ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-200 text-neutral-600'}`}>
                  {c.isText ? <MessageSquare className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium fluid-text-sm ${c.priority ? 'text-red-600 dark:text-red-400' : ''}`}>
                    {c.name}
                  </div>
                  <div className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {c.number}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
