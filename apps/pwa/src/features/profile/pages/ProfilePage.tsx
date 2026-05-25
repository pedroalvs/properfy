import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { TopBar } from '@/components/shell/TopBar';
import { ProfileCard } from '../components/ProfileCard';
import { InspectorDetailsCard } from '../components/InspectorDetailsCard';
import { AvailabilityGrid } from '../components/AvailabilityGrid';
import { ChangePasswordSection } from '../components/ChangePasswordSection';
import { TwoFactorSection } from '../components/TwoFactorSection';
import { SessionsSection } from '../components/SessionsSection';
import { InstallAppCard } from '../components/InstallAppCard';
import { AvatarUploader } from '../components/AvatarUploader';
import { UserDataSection } from '../components/UserDataSection';
import { Button } from '@/components/ui/Button';
import { useInspectorAvailabilityTemplate } from '../hooks/useInspectorAvailabilityTemplate';

export function ProfilePage() {
  const { user, logout, refreshUser } = useAuth();
  const { data: availability } = useInspectorAvailabilityTemplate();
  const [totpEnabled, setTotpEnabled] = useState(user?.totpEnabled ?? false);

  if (!user) return null;

  return (
    <div className="w-full pb-20">
      <TopBar title="Account" />

      <div className="flex flex-col gap-3 p-4">
        {/* Identity header */}
        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(51,65,85,0.86))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.20)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Inspector workspace</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="mt-1 text-sm text-white/80">{user.email}</p>
          {user.phone && <p className="mt-0.5 text-sm text-white/60">{user.phone}</p>}
          <p className="mt-3 max-w-[28rem] text-[11px] leading-relaxed text-white/55">
            This is your account hub for security, device access and installation.
          </p>
        </section>

        <ProfileCard
          name={user.name}
          email={user.email}
          role={user.role}
          status={user.status}
          phone={user.phone}
          totpEnabled={totpEnabled}
          lastLoginAt={user.lastLoginAt}
          photoUrl={user.inspectorPhotoUrl}
          avatarUploader={
            user.inspectorId ? (
              <AvatarUploader
                inspectorId={user.inspectorId}
                onUploaded={refreshUser}
              />
            ) : undefined
          }
        />

        {/* Editable inspector details */}
        {user.inspectorId && (
          <UserDataSection
            inspectorId={user.inspectorId}
            phone={user.phone}
            onSaved={refreshUser}
          />
        )}

        {/* Inspector details (read-only) */}
        <InspectorDetailsCard />

        {/* Availability schedule */}
        <h2 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Availability</h2>
        <div className="rounded-2xl bg-surface p-4 shadow-card" data-testid="availability-section">
          <AvailabilityGrid availability={availability} />
        </div>

        {/* Security section */}
        <h2 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Security</h2>
        <ChangePasswordSection />
        <TwoFactorSection enabled={totpEnabled} onEnabled={() => setTotpEnabled(true)} />
        <SessionsSection />

        {/* App section */}
        <h2 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">App</h2>
        <InstallAppCard />

        {/* Logout */}
        <div className="mt-4">
          <Button variant="secondary" onClick={logout} className="w-full !rounded-2xl">
            Log Out
          </Button>
        </div>

        <p className="text-center text-xs text-text-muted">Properfy Inspector v1.0</p>
      </div>
    </div>
  );
}
