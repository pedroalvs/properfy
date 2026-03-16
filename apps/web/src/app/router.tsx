import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from '@/components/shell/AppShell';
import { AppointmentListPage } from '@/features/appointments/pages/AppointmentListPage';
import { PropertyListPage } from '@/features/properties/pages/PropertyListPage';
import { InspectorListPage } from '@/features/inspectors/pages/InspectorListPage';
import { ServiceGroupListPage } from '@/features/service-groups/pages/ServiceGroupListPage';
import { UserListPage } from '@/features/users/pages/UserListPage';

function Placeholder({ title }: { title: string }) {
  return <h2 className="text-page-title text-secondary">{title}</h2>;
}

function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app-bg">
      <div className="rounded bg-card-bg p-8 shadow">
        <h1 className="text-page-title text-secondary">Login</h1>
        <p className="mt-2 text-text-secondary">Em breve</p>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/appointments" replace /> },
          { path: 'appointments', element: <AppointmentListPage /> },
          { path: 'properties', element: <PropertyListPage /> },
          { path: 'service-groups', element: <ServiceGroupListPage /> },
          { path: 'financial', element: <Placeholder title="Financeiro" /> },
          { path: 'inspectors', element: <InspectorListPage /> },
          { path: 'tenants', element: <Placeholder title="Inquilinos" /> },
          { path: 'users', element: <UserListPage /> },
          { path: 'reports', element: <Placeholder title="Relatórios" /> },
        ],
      },
    ],
  },
]);
