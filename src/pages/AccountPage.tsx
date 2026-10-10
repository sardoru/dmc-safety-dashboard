import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, LifeBuoy, ShieldCheck, Ticket, UserPlus } from 'lucide-react';
import EmergencyContacts from '../components/EmergencyContacts';
import PasskeyManager from '../components/PasskeyManager';
import ProfileCard from '../components/account/ProfileCard';
import SessionCard from '../components/account/SessionCard';
import StorefrontCard from '../components/account/StorefrontCard';
import VoiceAlertsCard from '../components/account/VoiceAlertsCard';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { buttonClasses } from '../components/ui/styles';
import { useAuth } from '../context/AuthContext';

export default function AccountPage() {
  const { role, isDemo, email } = useAuth();
  const business = role === 'business';
  const admin = role === 'admin';
  // ?passkey=setup — arrived from an administrator's setup link.
  const [params, setParams] = useSearchParams();
  const setup = !isDemo && params.get('passkey') === 'setup';
  const endSetup = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('passkey');
        return next;
      },
      { replace: true },
    );

  const passkeys = (
    <Card>
      <CardHeader
        icon={<KeyRound className="h-[18px] w-[18px]" />}
        title="Passkeys"
        subtitle={isDemo ? undefined : 'Skip the email link on devices you trust.'}
      />
      {isDemo ? (
        <p className="text-[13px] leading-relaxed text-muted">
          Passkeys let you sign in with Face ID, Touch ID or your device PIN instead of waiting for an email link.
          They’re available on the live dashboard.
        </p>
      ) : (
        <PasskeyManager setup={setup} account={email} onSetupDone={endSetup} />
      )}
    </Card>
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        description={
          business
            ? 'Your profile, storefront, spoken alerts and how you sign in.'
            : 'Your profile, spoken alerts and how you sign in.'
        }
      />

      {setup && <div className="mb-5 max-w-xl">{passkeys}</div>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
          {/* Phones: administrators reach this page from the avatar and look for invites here, so it links
              straight to them. (On a desktop the sidebar has Administration.) */}
          {admin && (
            <Card className="lg:hidden">
              <CardHeader
                icon={<ShieldCheck className="h-[18px] w-[18px]" />}
                title="Administration"
                subtitle="Invite people, hand out access codes and manage the team."
              />
              <div className="grid grid-cols-2 gap-2">
                <Link to="/admin#invite" className={buttonClasses({ variant: 'primary', size: 'md', block: true })}>
                  <UserPlus className="h-4 w-4" /> Invite someone
                </Link>
                <Link to="/admin?tab=access" className={buttonClasses({ variant: 'secondary', size: 'md', block: true })}>
                  <Ticket className="h-4 w-4" /> Access codes
                </Link>
              </div>
            </Card>
          )}
          <ProfileCard />
          {business && <StorefrontCard />}
          <VoiceAlertsCard />
        </div>

        <div className="min-w-0 space-y-5">
          {!setup && passkeys}

          <Card>
            <CardHeader
              icon={<LifeBuoy className="h-[18px] w-[18px]" />}
              title="Emergency contacts"
              subtitle="This dashboard is not 911. If anyone is in danger, call first."
            />
            <EmergencyContacts />
          </Card>

          <SessionCard />
        </div>
      </div>
    </PageContainer>
  );
}
