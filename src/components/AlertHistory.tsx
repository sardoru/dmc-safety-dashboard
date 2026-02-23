import { useState } from 'react';
import { AlertTriangle, Clock, CheckCircle, Eye, Filter, MapPin } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { useProfile } from '../context/ProfileContext';
import { formatRelative } from '../utils/helpers';
import type { AlertStatus, IncidentType } from '../types';
import EmergencyContacts from './EmergencyContacts';

const incidentTypes: IncidentType[] = [
  'Medical Emergency',
  'Suspicious Activity',
  'Property Crime',
  'Noise Disturbance',
  'Fire/Hazard',
  'Other',
];

const statusIcons: Record<AlertStatus, React.ReactNode> = {
  active: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
  acknowledged: <Eye className="w-3.5 h-3.5 text-amber-500" />,
  resolved: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
};

const statusColors: Record<AlertStatus, string> = {
  active: 'text-red-500 bg-red-500/10',
  acknowledged: 'text-amber-500 bg-amber-500/10',
  resolved: 'text-green-500 bg-green-500/10',
};

interface AlertHistoryProps {
  onFocusAlert?: (lat: number, lng: number) => void;
}

export default function AlertHistory({ onFocusAlert }: AlertHistoryProps) {
  const { theme } = useTheme();
  const { alerts, updateAlertStatus, acknowledgeAlert } = useAlerts();
  const { profile } = useProfile();
  const [filterType, setFilterType] = useState<IncidentType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AlertStatus | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const dark = theme === 'dark';

  const filtered = alerts.filter(a => {
    if (filterType !== 'all' && a.incidentType !== filterType) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden ${dark ? 'card-dark' : 'card-light'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between border-b ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
          <h2 className="font-semibold fluid-text-sm">Alert History</h2>
          <span className={`fluid-text-xs px-1.5 py-0.5 rounded-full ${dark ? 'bg-white/10 text-neutral-400' : 'bg-neutral-100 text-neutral-500'}`}>
            {filtered.length}
          </span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`tap-target p-2 rounded-lg transition-colors ${showFilters ? 'bg-navy-600 text-white' : dark ? 'hover:bg-white/10' : 'hover:bg-neutral-100'}`}
          aria-label="Toggle filters"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className={`px-3 py-2.5 border-b space-y-2 animate-slide-up ${dark ? 'border-white/5' : 'border-neutral-100'}`}>
          <div>
            <label className={`fluid-text-xs font-medium ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>Type</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as IncidentType | 'all')}
              className={`
                w-full mt-1 px-2 py-1.5 rounded-lg fluid-text-xs outline-none
                ${dark ? 'bg-white/5 text-neutral-200 border border-white/10' : 'bg-neutral-50 text-neutral-700 border border-neutral-200'}
              `}
            >
              <option value="all">All Types</option>
              {incidentTypes.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={`fluid-text-xs font-medium ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as AlertStatus | 'all')}
              className={`
                w-full mt-1 px-2 py-1.5 rounded-lg fluid-text-xs outline-none
                ${dark ? 'bg-white/5 text-neutral-200 border border-white/10' : 'bg-neutral-50 text-neutral-700 border border-neutral-200'}
              `}
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className={`text-center py-8 fluid-text-sm ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
            No alerts match your filters
          </div>
        ) : (
          filtered.map(alert => (
            <div
              key={alert.id}
              className={`
                p-3 rounded-lg animate-fade-in transition-colors
                ${alert.status === 'active'
                  ? dark ? 'bg-red-500/5 border border-red-500/20' : 'bg-red-50 border border-red-100'
                  : dark ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-neutral-50/50 hover:bg-neutral-50'
                }
              `}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  {statusIcons[alert.status]}
                  <span className="font-semibold fluid-text-xs">{alert.incidentType}</span>
                </div>
                <span className={`px-1.5 py-0.5 rounded-full fluid-text-xs font-medium ${statusColors[alert.status]}`}>
                  {alert.status}
                </span>
              </div>

              <div className="mb-1">
                <span className={`font-medium fluid-text-xs ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                  {alert.businessName}
                </span>
              </div>

              <p className={`fluid-text-xs line-clamp-2 mb-2 ${dark ? 'text-neutral-400' : 'text-neutral-500'}`}>
                {alert.description}
              </p>

              <div className="flex items-center justify-between">
                <span className={`fluid-text-xs ${dark ? 'text-neutral-600' : 'text-neutral-400'}`}>
                  {formatRelative(alert.timestamp)}
                </span>

                <div className="flex items-center gap-1.5">
                  {onFocusAlert && (
                    <button
                      onClick={() => onFocusAlert(alert.lat, alert.lng)}
                      className={`tap-target p-1.5 rounded-md fluid-text-xs ${dark ? 'hover:bg-white/10' : 'hover:bg-neutral-200'}`}
                      title="Zoom to location"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {alert.status === 'active' && profile && alert.businessId !== profile.id && (
                    <button
                      onClick={() => acknowledgeAlert(alert.id, profile.id)}
                      className={`
                        tap-target px-2 py-1 rounded-md fluid-text-xs font-medium transition-colors
                        ${dark ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 text-amber-600 hover:bg-amber-100'}
                      `}
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status !== 'resolved' && profile && alert.businessId === profile.id && (
                    <button
                      onClick={() => updateAlertStatus(alert.id, 'resolved')}
                      className={`
                        tap-target px-2 py-1 rounded-md fluid-text-xs font-medium transition-colors
                        ${dark ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-green-50 text-green-600 hover:bg-green-100'}
                      `}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>

              {alert.acknowledgedBy.length > 0 && (
                <div className={`mt-1.5 pt-1.5 border-t fluid-text-xs ${dark ? 'border-white/5 text-neutral-500' : 'border-neutral-100 text-neutral-400'}`}>
                  {alert.acknowledgedBy.length} business{alert.acknowledgedBy.length > 1 ? 'es' : ''} acknowledged
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Emergency contacts */}
      <div className="px-3 pb-3">
        <EmergencyContacts />
      </div>
    </div>
  );
}
