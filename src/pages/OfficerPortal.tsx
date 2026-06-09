import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio,
  Mic,
  Keyboard,
  MapPin,
  Send,
  Loader2,
  CheckCircle2,
  Stethoscope,
  Eye,
  ShieldAlert,
  Volume2,
  Flame,
  HelpCircle,
  LayoutDashboard,
} from 'lucide-react';
import PortalShell from '../components/PortalShell';
import VoiceReportRealtime from '../components/officer/VoiceReportRealtime';
import QuickReportSpeech, { type QuickResult } from '../components/officer/QuickReportSpeech';
import ReportPinMap, { type PinValue } from '../components/officer/ReportPinMap';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import { formatRelative } from '../utils/helpers';
import type { CapturedReport } from '../lib/realtime';
import type { IncidentType } from '../types';

const INCIDENT_OPTIONS: { type: IncidentType; icon: React.ReactNode; color: string }[] = [
  { type: 'Suspicious Activity', icon: <Eye className="w-4 h-4" />, color: 'bg-amber-500' },
  { type: 'Property Crime', icon: <ShieldAlert className="w-4 h-4" />, color: 'bg-orange-500' },
  { type: 'Medical Emergency', icon: <Stethoscope className="w-4 h-4" />, color: 'bg-red-500' },
  { type: 'Noise Disturbance', icon: <Volume2 className="w-4 h-4" />, color: 'bg-blue-500' },
  { type: 'Fire/Hazard', icon: <Flame className="w-4 h-4" />, color: 'bg-red-600' },
  { type: 'Other', icon: <HelpCircle className="w-4 h-4" />, color: 'bg-neutral-500' },
];

const VALID_TYPES = INCIDENT_OPTIONS.map((o) => o.type);

function normalizeIncident(value?: string): IncidentType {
  return (VALID_TYPES as string[]).includes(value ?? '')
    ? (value as IncidentType)
    : 'Suspicious Activity';
}

async function geocodeHint(hint: string): Promise<PinValue | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        `${hint}, Memphis, TN`,
      )}&limit=1`,
    );
    const data = await res.json();
    if (data?.length) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default function OfficerPortal() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { profile: officerProfile } = useAuth();
  const { addReport, alerts } = useAlerts();

  const [mode, setMode] = useState<'voice' | 'quick'>('voice');
  const [incidentType, setIncidentType] = useState<IncidentType>('Suspicious Activity');
  const [description, setDescription] = useState('');
  const [transcript, setTranscript] = useState('');
  const [pin, setPin] = useState<PinValue | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const officerName = officerProfile?.display_name || 'Public Safety';

  const appendTranscript = (text: string) =>
    setTranscript((prev) => (prev ? `${prev} ${text}` : text));

  const handleCaptured = async (r: CapturedReport) => {
    setIncidentType(normalizeIncident(r.incident_type));
    if (r.description) setDescription(r.description);
    if (r.location_hint && !pin) {
      const place = await geocodeHint(r.location_hint);
      if (place) setPin(place);
    }
  };

  const handleQuick = async (r: QuickResult) => {
    appendTranscript(r.transcript);
    setIncidentType(normalizeIncident(r.incident_type));
    setDescription(r.description || r.transcript);
    if (r.location_hint && !pin) {
      const place = await geocodeHint(r.location_hint);
      if (place) setPin(place);
    }
  };

  const reset = () => {
    setIncidentType('Suspicious Activity');
    setDescription('');
    setTranscript('');
    setPin(null);
    setSubmitted(false);
    setError('');
  };

  const submit = async () => {
    const finalDescription = description.trim() || transcript.trim();
    if (!pin) {
      setError('Drop a pin where you witnessed this.');
      return;
    }
    if (!finalDescription) {
      setError('Add a description (voice, tap-to-speak, or type).');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await addReport({
        source: 'officer',
        kind: mode === 'voice' ? 'voice' : 'quick',
        incidentType,
        description: finalDescription,
        transcript: transcript.trim() || undefined,
        lat: pin.lat,
        lng: pin.lng,
        address: pin.address,
        businessName: officerName,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the report.');
    } finally {
      setSubmitting(false);
    }
  };

  const recent = alerts.filter((a) => a.timestamp > Date.now() - 86_400_000).slice(0, 6);

  if (submitted) {
    return (
      <PortalShell title="Report filed" eyebrow="Public Safety Officer" icon={<Radio className="w-6 h-6" />}>
        <div className={`rounded-2xl p-8 text-center ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-sm border border-neutral-100'}`}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h3 className="font-bold fluid-text-lg mb-1">Report submitted</h3>
          <p className={`fluid-text-sm mb-6 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
            It’s now live on the dashboard map and connected businesses nearby have been alerted.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={reset}
              className={`tap-target px-4 py-2.5 rounded-xl font-semibold fluid-text-sm ${dark ? 'bg-gold-500 hover:bg-gold-400 text-navy-900' : 'bg-navy-600 hover:bg-navy-700 text-white'}`}
            >
              File another report
            </button>
            <Link
              to="/"
              className={`tap-target inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold fluid-text-sm ${dark ? 'bg-white/5 hover:bg-white/10 text-neutral-200' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'}`}
            >
              <LayoutDashboard className="w-4 h-4" /> View on map
            </Link>
          </div>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="Report suspicious activity"
      eyebrow="Public Safety Officer"
      icon={<Radio className="w-6 h-6" />}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Capture */}
        <section className={`rounded-2xl p-5 ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-sm border border-neutral-100'}`}>
          <div className={`inline-flex p-1 rounded-xl mb-5 ${dark ? 'bg-white/5' : 'bg-neutral-100'}`}>
            <ModeTab active={mode === 'voice'} onClick={() => setMode('voice')} icon={<Mic className="w-4 h-4" />} label="Voice-to-voice" dark={dark} />
            <ModeTab active={mode === 'quick'} onClick={() => setMode('quick')} icon={<Keyboard className="w-4 h-4" />} label="Tap-to-speak" dark={dark} />
          </div>

          <div className="py-4">
            {mode === 'voice' ? (
              <VoiceReportRealtime onUserTranscript={appendTranscript} onReport={handleCaptured} />
            ) : (
              <QuickReportSpeech onResult={handleQuick} />
            )}
          </div>

          {transcript && (
            <div className={`mt-4 p-3 rounded-xl fluid-text-sm leading-relaxed ${dark ? 'bg-white/5 text-neutral-300' : 'bg-neutral-50 text-neutral-600'}`}>
              <p className={`fluid-text-xs font-semibold uppercase tracking-wide mb-1 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Transcript
              </p>
              {transcript}
            </div>
          )}
        </section>

        {/* Details + location + submit */}
        <section className={`rounded-2xl p-5 ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-sm border border-neutral-100'}`}>
          <label className={`block mb-2 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Incident type
          </label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {INCIDENT_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => setIncidentType(opt.type)}
                className={`tap-target flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all text-left ${
                  incidentType === opt.type
                    ? `${opt.color} text-white`
                    : dark
                      ? 'bg-white/5 hover:bg-white/10 text-neutral-300'
                      : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-700'
                }`}
              >
                {opt.icon}
                <span className="font-medium fluid-text-xs leading-tight">{opt.type}</span>
              </button>
            ))}
          </div>

          <label className={`block mb-2 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Captured from your voice report — edit as needed."
            rows={3}
            className={`w-full px-3 py-2.5 rounded-xl outline-none fluid-text-sm resize-none mb-4 ${
              dark
                ? 'bg-white/5 text-neutral-200 placeholder:text-neutral-600 border border-white/10 focus:border-gold-500/50'
                : 'bg-neutral-50 text-neutral-700 placeholder:text-neutral-400 border border-neutral-200 focus:border-navy-400'
            }`}
          />

          <label className={`flex items-center gap-1.5 mb-2 font-medium fluid-text-sm ${dark ? 'text-neutral-300' : 'text-neutral-700'}`}>
            <MapPin className="w-4 h-4 text-gold-500" /> Location
          </label>
          <ReportPinMap value={pin} onPlace={setPin} />
          {pin?.address && (
            <p className={`mt-2 fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {pin.address}
            </p>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl bg-red-500/10 text-red-500 fluid-text-sm">{error}</div>
          )}

          <button
            onClick={submit}
            disabled={submitting}
            className={`mt-4 w-full tap-target py-3.5 rounded-xl font-bold fluid-text-base transition-all flex items-center justify-center gap-2 ${
              dark ? 'bg-gold-500 hover:bg-gold-400 text-navy-900' : 'bg-navy-600 hover:bg-navy-700 text-white'
            } ${submitting ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'}`}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </section>
      </div>

      {recent.length > 0 && (
        <section className="mt-6">
          <h3 className={`font-bold fluid-text-base mb-3 ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>
            Recent downtown reports
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {recent.map((a) => (
              <div
                key={a.id}
                className={`flex items-start gap-3 p-3 rounded-xl ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white border border-neutral-100'}`}
              >
                <span
                  className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    a.status === 'active' ? 'bg-red-500' : a.status === 'acknowledged' ? 'bg-amber-500' : 'bg-neutral-400'
                  }`}
                />
                <div className="min-w-0">
                  <p className="fluid-text-sm font-medium truncate">{a.incidentType}</p>
                  <p className={`fluid-text-xs truncate ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {a.businessName} · {formatRelative(a.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </PortalShell>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg fluid-text-sm font-semibold transition-all ${
        active
          ? dark
            ? 'bg-navy-600 text-white'
            : 'bg-white text-navy-600 shadow-sm'
          : dark
            ? 'text-neutral-400 hover:text-neutral-200'
            : 'text-neutral-500 hover:text-neutral-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
