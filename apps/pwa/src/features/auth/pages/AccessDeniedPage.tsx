import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';

export function AccessDeniedPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg px-page-x">
      <div className="w-full max-w-sm text-center">
        <i className="mdi mdi-shield-lock-outline text-[64px] text-warning" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-secondary">Access Denied</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Hello, <strong>{user?.name}</strong>. Your account role (
          {user?.role}) is not supported on this mobile app.
        </p>
        <p className="mt-4 text-sm text-text-secondary">
          This app is exclusive for inspectors in the field. Please use the
          Properfy web portal for admin or agency management.
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
