import { useState } from 'react';
import { FlaskConical, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { Role } from '../../types';
import { ROLE_LABEL } from '../layout/nav';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { Segmented } from '../ui/Form';
import { messageOf } from './util';

const DEMO_ROLES: { value: Role; label: string }[] = (['business', 'officer', 'admin'] as Role[]).map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));

/** Sign out (connected) or switch persona / leave the demo. */
export default function SessionCard() {
  const { isDemo, role, email, signOut, setDemoRole } = useAuth();
  const { push } = useToast();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    try {
      await signOut();
    } catch (err) {
      setLeaving(false);
      push({ title: 'Couldn’t sign out', body: messageOf(err, 'Please try again.'), tone: 'danger' });
    }
  };

  return (
    <Card>
      <CardHeader
        icon={isDemo ? <FlaskConical className="h-[18px] w-[18px]" /> : <LogOut className="h-[18px] w-[18px]" />}
        title={isDemo ? 'Demo session' : 'Session'}
        subtitle={
          isDemo
            ? 'You’re exploring with sample data — nothing is sent to officers.'
            : email
              ? `Signed in as ${email}`
              : 'You’re signed in.'
        }
      />

      {isDemo && role && (
        <div className="mb-5">
          <p className="label">Switch role</p>
          <Segmented
            size="sm"
            value={role}
            onChange={(r) => setDemoRole(r)}
            options={DEMO_ROLES}
            label="Switch demo role"
          />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            See the dashboard as a business, a Public Safety officer or an administrator.
          </p>
        </div>
      )}

      <Button
        variant="secondary"
        block
        loading={leaving}
        icon={<LogOut className="h-4 w-4" />}
        onClick={() => void leave()}
      >
        {isDemo ? 'Leave demo' : 'Sign out'}
      </Button>
    </Card>
  );
}
