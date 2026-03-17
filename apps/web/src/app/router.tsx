import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AppShell } from '@/components/shell/AppShell';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { AppointmentListPage } from '@/features/appointments/pages/AppointmentListPage';
import { PropertyListPage } from '@/features/properties/pages/PropertyListPage';
import { InspectorListPage } from '@/features/inspectors/pages/InspectorListPage';
import { ServiceGroupListPage } from '@/features/service-groups/pages/ServiceGroupListPage';
import { UserListPage } from '@/features/users/pages/UserListPage';
import { FinancialListPage } from '@/features/financial/pages/FinancialListPage';
import { TenantContactListPage } from '@/features/tenants/pages/TenantContactListPage';
import { ReportListPage } from '@/features/reports/pages/ReportListPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { PortalPage } from '@/features/tenant-portal/pages/PortalPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/portal/:token',
    element: <PortalPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'appointments', element: <AppointmentListPage /> },
          { path: 'properties', element: <PropertyListPage /> },
          { path: 'service-groups', element: <ServiceGroupListPage /> },
          { path: 'financial', element: <FinancialListPage /> },
          { path: 'inspectors', element: <InspectorListPage /> },
          { path: 'tenants', element: <TenantContactListPage /> },
          { path: 'users', element: <UserListPage /> },
          { path: 'reports', element: <ReportListPage /> },
        ],
      },
    ],
  },
]);
