import { useState, type FormEvent } from 'react';
import { FlaskConical, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input } from '../ui/Form';
import { Avatar } from '../ui/Misc';
import EmailText from './EmailText';
import RoleChip from './RoleChip';
import { messageOf } from './util';

/** Who you are on the dashboard: identity, role and the name shown on your reports. */
export default function ProfileCard() {
  const { isDemo, user, profile, role, displayName, email, refreshProfile } = useAuth();
  const { push } = useToast();

  const savedName = isDemo ? displayName : (profile?.display_name ?? '');
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft ?? savedName;
  const dirty = draft !== null && draft.trim() !== savedName;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    if (isDemo) {
      setDraft(null);
      push({
        title: 'Names are fixed in demo mode',
        body: `Sample personas keep their names so reports stay consistent. You're viewing as ${displayName}.`,
        tone: 'info',
      });
      return;
    }
    if (!user) return;
    const next = value.trim();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: next || null })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setDraft(null);
      push({
        title: 'Name updated',
        body: next ? `You'll appear as ${next} on reports and notes.` : 'Your email name will be shown instead.',
        tone: 'success',
      });
    } catch (err) {
      push({ title: 'Couldn’t update your name', body: messageOf(err, 'Please try again in a moment.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<UserRound className="h-[18px] w-[18px]" />}
        title="Profile"
        subtitle="How you appear to officers and on the reports you file."
      />

      <div className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface-2 p-3.5">
        <Avatar name={displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{displayName}</p>
          <p className="text-[13px] text-muted wrap-anywhere">{email ? <EmailText email={email} /> : 'No email on file'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {role && <RoleChip role={role} />}
            {isDemo && (
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-3 px-2.5 text-[12px] font-semibold text-muted">
                <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                Demo persona
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="mt-5">
        <Field
          label="Display name"
          hint={
            isDemo
              ? 'Demo personas keep a fixed name.'
              : 'Shown on reports, notes and assignments. Leave blank to use your email name.'
          }
        >
          {(id) => (
            <div className="flex gap-2">
              <Input
                id={id}
                value={value}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={role === 'business' ? 'e.g. Dana Whitfield' : 'e.g. Officer J. Smith'}
                autoComplete="name"
                maxLength={80}
              />
              <Button type="submit" variant="secondary" loading={saving} disabled={!dirty} className="flex-shrink-0">
                Save
              </Button>
            </div>
          )}
        </Field>
      </form>
    </Card>
  );
}
