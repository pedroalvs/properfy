import { Navigate, Outlet, useLocation } from 'react-router-dom';
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
  const toastShown = useRef<string | null>(null);

  const isDenied = !isLoading && (!user || !roles.includes(user.role as UserRole));

  useEffect(() => {
    if (isDenied && toastShown.current !== location.pathname) {
      toastShown.current = location.pathname;
      showInfo('You do not have permission to access this page');
    }
  }, [isDenied, location.pathname, showInfo]);

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }

  if (isDenied) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
