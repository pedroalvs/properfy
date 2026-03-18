import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@properfy/shared';

export function InspectorAuthGuard() {
  const { user } = useAuth();

  if (!user || user.role !== UserRole.INSP) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
