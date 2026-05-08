import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { LoadingState } from '@/components/feedback/LoadingState';
import type { UserRole } from '@properfy/shared';
import { useEffect, useRef } from 'react';

interface AuthGuardProps {
  roles: UserRole[];
  children?: React.ReactNode;
}

export function AuthGuard({ roles, children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const { showInfo } = useSnackbar();
  const location = useLocation();
  const navigate = useNavigate();
  const toastShown = useRef<string | null>(null);

  const isDenied = !isLoading && (!user || !roles.includes(user.role as UserRole));

  useEffect(() => {
    if (!isDenied) return;
    if (toastShown.current !== location.pathname) {
      toastShown.current = location.pathname;
      showInfo('You do not have permission to access this page');
    }
    navigate('/dashboard', { replace: true });
  }, [isDenied, location.pathname, showInfo, navigate]);

  if (isLoading || isDenied) {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
