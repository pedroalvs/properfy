import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from '@/components/shell/AppShell';
import { AppointmentListPage } from '@/features/appointments/pages/AppointmentListPage';

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
          { path: 'properties', element: <Placeholder title="Imóveis" /> },
          { path: 'service-groups', element: <Placeholder title="Grupos de Serviço" /> },
          { path: 'financial', element: <Placeholder title="Financeiro" /> },
          { path: 'inspectors', element: <Placeholder title="Inspetores" /> },
          { path: 'tenants', element: <Placeholder title="Inquilinos" /> },
          { path: 'users', element: <Placeholder title="Usuários" /> },
          { path: 'reports', element: <Placeholder title="Relatórios" /> },
        ],
      },
    ],
  },
]);
