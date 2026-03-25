import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@properfy/shared';

export function InspectorAuthGuard() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== UserRole.INSP) {
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}
