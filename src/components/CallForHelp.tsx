import { useState } from 'react';
import {
  AlertTriangle,
  X,
  Stethoscope,
  Eye,
  ShieldAlert,
  Volume2,
  Flame,
  HelpCircle,
  Camera,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { useProfile } from '../context/ProfileContext';
import type { IncidentType } from '../types';

const incidentOptions: { type: IncidentType; icon: React.ReactNode; color: string }[] = [
  { type: 'Medical Emergency', icon: <Stethoscope className="w-5 h-5" />, color: 'bg-red-500' },
  { type: 'Suspicious Activity', icon: <Eye className="w-5 h-5" />, color: 'bg-amber-500' },
  { type: 'Property Crime', icon: <ShieldAlert className="w-5 h-5" />, color: 'bg-orange-500' },
  { type: 'Noise Disturbance', icon: <Volume2 className="w-5 h-5" />, color: 'bg-blue-500' },
  { type: 'Fire/Hazard', icon: <Flame className="w-5 h-5" />, color: 'bg-red-600' },
  { type: 'Other', icon: <HelpCircle className="w-5 h-5" />, color: 'bg-neutral-500' },
];

export default function CallForHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const { theme } = useTheme();
  const { addAlert } = useAlerts();
  const { profile } = useProfile();
  const dark = theme === 'dark';

  const reset = () => {
    setSelected(null);
    setDescription('');
    setSubmitting(false);
    setSuccess(false);
  };

  const handleOpen = () => {
    reset();
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!selected || !profile) return;
    setSubmitting(true);

    setTimeout(() => {
      addAlert({
        businessId: profile.id,
        businessName: profile.businessName,
        address: profile.address,
        incidentType: selected,
        description: description || `${selected} reported by ${profile.businessName}`,
        lat: profile.lat,
        lng: profile.lng,
      });
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => {
        setIsOpen(false);
        reset();
      }, 1500);
    }, 500);
  };

  return (
    <>
      {/* Floating emergency button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-2 px-5 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg shadow-red-600/30 transition-all hover:scale-105 active:scale-95 tap-target"
        aria-label="Call for Help"
      >
        <AlertTriangle className="w-5 h-5" />
        <span className="font-bold fluid-text-sm">Call for Help</span>
      </button>

      {/* Modal overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          <div className={`
            relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl animate-slide-up
            ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-2xl'}
          `}>
            {/* Modal header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${dark ? 'border-white/10' : 'border-neutral-100'}`}>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-500" />
                <h2 className="font-bold fluid-text-lg">Report an Incident</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className={`tap-target p-2 rounded-lg ${dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success ? (
              <div className="px-5 py-12 text-center animate-slide-up">
                <div className="w-16 h-16 mx-auto mb-4 bg-green-500/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="font-bold fluid-text-lg mb-1">Alert Sent!</h3>
                <p className={`fluid-text-sm ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                  All connected businesses have been notified.
                </p>
              </div>
            ) : (
              <div className="px-5 py-4 space-y-4">
                {!profile && (
                  <div className={`p-3 rounded-lg fluid-text-sm ${dark ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                    Please register your business first to send alerts.
                  </div>
                )}

                {/* Incident type selection */}
                <div>
                  <label className={`block mb-2 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    Incident Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {incidentOptions.map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => setSelected(opt.type)}
                        className={`
                          tap-target flex items-center gap-2.5 px-3 py-3 rounded-xl transition-all text-left
                          ${selected === opt.type
                            ? `${opt.color} text-white ring-2 ring-offset-2 ${dark ? 'ring-offset-neutral-900' : 'ring-offset-white'} ring-current`
                            : dark
                              ? 'bg-white/5 hover:bg-white/10 text-neutral-300'
                              : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                          }
                        `}
                      >
                        {opt.icon}
                        <span className="font-medium fluid-text-xs leading-tight">{opt.type}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className={`block mb-2 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    Description <span className={`font-normal ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>(optional)</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Provide additional details..."
                    rows={3}
                    className={`
                      w-full px-3 py-2.5 rounded-xl outline-none fluid-text-sm resize-none
                      ${dark
                        ? 'bg-white/5 text-neutral-200 placeholder:text-neutral-600 border border-white/10 focus:border-white/20'
                        : 'bg-neutral-50 text-neutral-700 placeholder:text-neutral-400 border border-neutral-200 focus:border-neutral-300'
                      }
                    `}
                  />
                </div>

                {/* Photo attachment placeholder */}
                <button
                  className={`
                    w-full tap-target flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed transition-colors
                    ${dark
                      ? 'border-white/10 text-neutral-500 hover:border-white/20 hover:text-neutral-400'
                      : 'border-neutral-200 text-neutral-400 hover:border-neutral-300 hover:text-neutral-500'
                    }
                  `}
                >
                  <Camera className="w-4 h-4" />
                  <span className="fluid-text-sm">Attach Photo</span>
                </button>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={!selected || !profile || submitting}
                  className={`
                    w-full tap-target py-3.5 rounded-xl font-bold fluid-text-base transition-all
                    ${selected && profile && !submitting
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 active:scale-[0.98]'
                      : dark
                        ? 'bg-white/5 text-neutral-600 cursor-not-allowed'
                        : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                    }
                  `}
                >
                  {submitting ? 'Sending Alert...' : 'Send Alert'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
