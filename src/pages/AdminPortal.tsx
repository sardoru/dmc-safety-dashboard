import { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Mail,
  Loader2,
  Trash2,
  Building2,
  Users,
  Send,
  Radio,
  CircleUserRound,
} from 'lucide-react';
import PortalShell from '../components/PortalShell';
import { useTheme } from '../context/ThemeContext';
import { useAlerts } from '../context/AlertContext';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { formatRelative } from '../utils/helpers';
import type { Role } from '../types';

interface OfficerRow {
  id: string;
  email: string | null;
  role: Role;
  display_name: string | null;
  created_at: string;
}
interface InviteRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}
interface BusinessRow {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export default function AdminPortal() {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const { alerts } = useAlerts();

  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'officer' | 'admin'>('officer');
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const [o, i, b] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, email, role, display_name, created_at')
        .in('role', ['officer', 'admin'])
        .order('created_at', { ascending: true }),
      supabase
        .from('officer_invites')
        .select('id, email, role, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('businesses')
        .select('id, name, address, created_at')
        .order('created_at', { ascending: false }),
    ]);
    setOfficers((o.data as OfficerRow[]) ?? []);
    setInvites((i.data as InviteRow[]) ?? []);
    setBusinesses((b.data as BusinessRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError('');
    setNotice('');
    try {
      const result = await apiFetch<{ status: string; emailed: boolean }>(
        '/api/officers/invite',
        { method: 'POST', json: { email, role } },
      );
      setNotice(
        result.status === 'granted'
          ? `Access granted to ${email}.`
          : `Invitation sent to ${email}.`,
      );
      setEmail('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite.');
    } finally {
      setInviting(false);
    }
  };

  const revokeInvite = async (id: string) => {
    await supabase.from('officer_invites').delete().eq('id', id);
    setInvites((prev) => prev.filter((x) => x.id !== id));
  };

  const demoteOfficer = async (id: string) => {
    await supabase.from('profiles').update({ role: 'business' }).eq('id', id);
    setOfficers((prev) => prev.filter((x) => x.id !== id));
  };

  const reports24h = alerts.filter((a) => a.timestamp > Date.now() - 86_400_000).length;

  return (
    <PortalShell title="Administration" eyebrow="Admin" icon={<ShieldCheck className="w-6 h-6" />}>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat dark={dark} icon={<Users className="w-4 h-4" />} label="Officers" value={officers.length} />
        <Stat dark={dark} icon={<Building2 className="w-4 h-4" />} label="Businesses" value={businesses.length} />
        <Stat dark={dark} icon={<Mail className="w-4 h-4" />} label="Pending invites" value={invites.length} />
        <Stat dark={dark} icon={<Radio className="w-4 h-4" />} label="Reports · 24h" value={reports24h} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Invite officer */}
        <Card dark={dark} title="Invite a safety officer" icon={<UserPlus className="w-4 h-4" />}>
          <form onSubmit={invite} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="officer@memphisdowntown.com"
              className={`w-full px-3 py-2.5 rounded-xl outline-none fluid-text-sm ${
                dark
                  ? 'bg-white/5 text-neutral-200 placeholder:text-neutral-600 border border-white/10 focus:border-gold-500/50'
                  : 'bg-neutral-50 text-neutral-700 placeholder:text-neutral-400 border border-neutral-200 focus:border-navy-400'
              }`}
              required
            />
            <div className="flex items-center gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'officer' | 'admin')}
                className={`flex-1 px-3 py-2.5 rounded-xl outline-none fluid-text-sm ${
                  dark ? 'bg-white/5 text-neutral-200 border border-white/10' : 'bg-neutral-50 text-neutral-700 border border-neutral-200'
                }`}
              >
                <option value="officer">Safety Officer</option>
                <option value="admin">Administrator</option>
              </select>
              <button
                type="submit"
                disabled={inviting}
                className={`tap-target flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold fluid-text-sm ${
                  dark ? 'bg-gold-500 hover:bg-gold-400 text-navy-900' : 'bg-navy-600 hover:bg-navy-700 text-white'
                } ${inviting ? 'opacity-70 cursor-wait' : 'active:scale-[0.98]'}`}
              >
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Invite
              </button>
            </div>
            {notice && <p className="fluid-text-sm text-green-500">{notice}</p>}
            {error && <p className="fluid-text-sm text-red-500">{error}</p>}
            <p className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
              They’ll get a branded email with a secure sign-in link. The officer role is applied
              automatically on first sign-in.
            </p>
          </form>

          {/* Pending invites */}
          {invites.length > 0 && (
            <div className={`mt-5 pt-4 border-t ${dark ? 'border-white/10' : 'border-neutral-100'}`}>
              <p className={`fluid-text-xs font-semibold uppercase tracking-wide mb-2 ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                Pending invitations
              </p>
              <ul className="space-y-2">
                {invites.map((inv) => (
                  <li key={inv.id} className={`flex items-center gap-2 p-2.5 rounded-lg ${dark ? 'bg-white/5' : 'bg-neutral-50'}`}>
                    <Mail className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="fluid-text-sm truncate">{inv.email}</p>
                      <p className={`fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                        {inv.role} · invited {formatRelative(new Date(inv.created_at).getTime())}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      className={`tap-target p-2 rounded-lg flex-shrink-0 ${dark ? 'hover:bg-red-500/15 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-neutral-400 hover:text-red-500'}`}
                      aria-label="Revoke invite"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Officers */}
        <Card dark={dark} title="Safety officers" icon={<Users className="w-4 h-4" />}>
          {loading ? (
            <Loading dark={dark} />
          ) : officers.length === 0 ? (
            <Empty dark={dark} text="No officers yet — invite one to get started." />
          ) : (
            <ul className="space-y-2">
              {officers.map((o) => (
                <li key={o.id} className={`flex items-center gap-3 p-3 rounded-xl ${dark ? 'bg-white/5' : 'bg-neutral-50'}`}>
                  <CircleUserRound className={`w-8 h-8 flex-shrink-0 ${dark ? 'text-gold-400' : 'text-navy-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="fluid-text-sm font-medium truncate">{o.display_name || o.email}</p>
                    <p className={`fluid-text-xs truncate ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      {o.email}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full fluid-text-xs font-semibold flex-shrink-0 ${
                      o.role === 'admin' ? 'bg-gold-500/15 text-gold-600' : 'bg-navy-500/15 text-navy-500'
                    }`}
                  >
                    {o.role}
                  </span>
                  <button
                    onClick={() => demoteOfficer(o.id)}
                    className={`tap-target p-2 rounded-lg flex-shrink-0 ${dark ? 'hover:bg-red-500/15 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-neutral-400 hover:text-red-500'}`}
                    aria-label="Remove officer access"
                    title="Remove officer access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Businesses */}
      <div className="mt-5">
        <Card dark={dark} title="Registered businesses" icon={<Building2 className="w-4 h-4" />}>
          {loading ? (
            <Loading dark={dark} />
          ) : businesses.length === 0 ? (
            <Empty dark={dark} text="No businesses have signed up yet." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {businesses.map((b) => (
                <li key={b.id} className={`p-3 rounded-xl ${dark ? 'bg-white/5' : 'bg-neutral-50'}`}>
                  <p className="fluid-text-sm font-medium truncate">{b.name}</p>
                  <p className={`fluid-text-xs truncate ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
                    {b.address}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PortalShell>
  );
}

function Stat({
  icon,
  label,
  value,
  dark,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  dark: boolean;
}) {
  return (
    <div className={`rounded-xl p-3.5 ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white border border-neutral-100 shadow-sm'}`}>
      <div className={`flex items-center gap-1.5 fluid-text-xs ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
        <span className={dark ? 'text-gold-400' : 'text-navy-600'}>{icon}</span>
        {label}
      </div>
      <p className="font-bold fluid-text-2xl mt-1 leading-none">{value}</p>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
  dark,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  dark: boolean;
}) {
  return (
    <section className={`rounded-2xl p-5 ${dark ? 'bg-neutral-900 border border-white/10' : 'bg-white shadow-sm border border-neutral-100'}`}>
      <h3 className={`flex items-center gap-2 font-bold fluid-text-base mb-4 ${dark ? 'text-neutral-200' : 'text-neutral-800'}`}>
        <span className={dark ? 'text-gold-400' : 'text-navy-600'}>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Loading({ dark }: { dark: boolean }) {
  return (
    <div className={`flex items-center gap-2 py-4 fluid-text-sm ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  );
}

function Empty({ text, dark }: { text: string; dark: boolean }) {
  return (
    <p className={`py-3 fluid-text-sm ${dark ? 'text-neutral-500' : 'text-neutral-400'}`}>{text}</p>
  );
}
