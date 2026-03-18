import { useAuth } from '@/hooks/useAuth';
import { ProfileCard } from '../components/ProfileCard';
import { Button } from '@/components/ui/Button';

export function ProfilePage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-bold text-text-primary">Profile</h1>
      <ProfileCard name={user.name} email={user.email} role={user.role} />
      <div className="mt-4">
        <Button variant="secondary" onClick={logout} className="w-full">
          Log Out
        </Button>
      </div>
      <p className="text-center text-xs text-text-muted">Properfy Inspector v1.0</p>
    </div>
  );
}
