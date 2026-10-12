import { useNavigate } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function DeactivatedPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-page-x">
      <div className="w-full max-w-sm text-center">
        <UserX size={64} className="text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-foreground">Account Deactivated</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your inspector account has been deactivated. Please contact your administrator.
        </p>
        <div className="mt-8">
          <Button variant="primary" onClick={handleLogout} className="w-full">
            Back to Login
          </Button>
        </div>
      </div>
    </div>
  );
}
