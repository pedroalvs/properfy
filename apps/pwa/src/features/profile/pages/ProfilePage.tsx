import { useAuth } from '@/hooks/useAuth';
import { ProfileCard } from '../components/ProfileCard';
import { InstallAppCard } from '../components/InstallAppCard';
import { Button } from '@/components/ui/Button';
import { TopBar } from '@/components/shell/TopBar';

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="w-full">
      <TopBar title="Profile" />
      <div className="flex flex-col gap-4 p-4">
        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(51,65,85,0.86))] px-5 py-5 text-white shadow-[0_18px_44px_rgba(15,23,42,0.20)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Inspector workspace</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">{user.name}</h1>
          <p className="mt-1 text-sm text-white/80">{user.email}</p>
        </section>
        <ProfileCard
          name={user.name}
          email={user.email}
          role={user.role}
          phone={user.phone}
          totpEnabled={user.totpEnabled}
          lastLoginAt={user.lastLoginAt}
        />
        <InstallAppCard />
        <div className="mt-2">
          <Button variant="secondary" onClick={logout} className="w-full !rounded-2xl">
            Log Out
          </Button>
        </div>
        <p className="text-center text-xs text-text-muted">Properfy Inspector v1.0</p>
      </div>
    </div>
  );
}
