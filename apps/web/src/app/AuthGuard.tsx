import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LoadingState } from '@/components/feedback/LoadingState';
import type { UserRole } from '@properfy/shared';

interface AuthGuardProps {
  roles: UserRole[];
  children?: React.ReactNode;
}

export function AuthGuard({ roles, children }: AuthGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingState rows={3} />
      </div>
    );
  }

  if (!user || !roles.includes(user.role as UserRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
