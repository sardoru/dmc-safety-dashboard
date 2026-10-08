import { KeyRound, LifeBuoy } from 'lucide-react';
import EmergencyContacts from '../components/EmergencyContacts';
import PasskeyManager from '../components/PasskeyManager';
import ProfileCard from '../components/account/ProfileCard';
import SessionCard from '../components/account/SessionCard';
import StorefrontCard from '../components/account/StorefrontCard';
import VoiceAlertsCard from '../components/account/VoiceAlertsCard';
import PageHeader, { PageContainer } from '../components/layout/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { useAuth } from '../context/AuthContext';

export default function AccountPage() {
  const { role, isDemo } = useAuth();
  const business = role === 'business';

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

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
          <ProfileCard />
          {business && <StorefrontCard />}
          <VoiceAlertsCard />
        </div>

        <div className="min-w-0 space-y-5">
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
              <PasskeyManager />
            )}
          </Card>

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
