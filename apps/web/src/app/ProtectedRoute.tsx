import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { savePostLoginRedirect } from '@/lib/post-login-redirect';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    savePostLoginRedirect(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
