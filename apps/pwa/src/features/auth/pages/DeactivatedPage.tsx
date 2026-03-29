import { useNavigate } from 'react-router-dom';
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
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-page-x">
      <div className="w-full max-w-sm text-center">
        <i className="mdi mdi-account-off-outline text-[64px] text-error" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-secondary">Account Deactivated</h1>
        <p className="mt-2 text-sm text-text-secondary">
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
