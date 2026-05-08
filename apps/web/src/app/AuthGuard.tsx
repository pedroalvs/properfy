import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSnackbar } from '@/hooks/useSnackbar';
import { LoadingState } from '@/components/feedback/LoadingState';
import type { UserRole } from '@properfy/shared';
import { useLayoutEffect } from 'react';

interface AuthGuardProps {
  roles: UserRole[];
  children?: React.ReactNode;
}

export function AuthGuard({ roles, children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();
  const { showInfo } = useSnackbar();
  const location = useLocation();

  const isDenied = !isLoading && (!user || !roles.includes(user.role as UserRole));

  // useLayoutEffect fires synchronously before paint and before Navigate's
  // own useEffect, guaranteeing the toast is queued before the redirect.
  useLayoutEffect(() => {
    if (!isDenied) return;
    showInfo('You do not have permission to access this page');
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
