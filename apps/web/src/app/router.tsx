import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthGuard } from './AuthGuard';
import { AppShell } from '@/components/shell/AppShell';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { AppointmentListPage } from '@/features/appointments/pages/AppointmentListPage';
import { AppointmentCreatePage } from '@/features/appointments/pages/AppointmentCreatePage';
import { AppointmentDetailPage } from '@/features/appointments/pages/AppointmentDetailPage';
import { AppointmentImportPage } from '@/features/appointments/pages/AppointmentImportPage';
import { AppointmentMapPage } from '@/features/appointments/pages/AppointmentMapPage';
import { PropertyListPage } from '@/features/properties/pages/PropertyListPage';
import { PropertyCreatePage } from '@/features/properties/pages/PropertyCreatePage';
import { PropertyDetailPage } from '@/features/properties/pages/PropertyDetailPage';
import { PropertyImportPage } from '@/features/properties/pages/PropertyImportPage';
import { PropertyMapPage } from '@/features/properties/pages/PropertyMapPage';
import { InspectorListPage } from '@/features/inspectors/pages/InspectorListPage';
import { ServiceGroupListPage } from '@/features/service-groups/pages/ServiceGroupListPage';
import { ServiceGroupCreatePage } from '@/features/service-groups/pages/ServiceGroupCreatePage';
import { ServiceGroupDetailPage } from '@/features/service-groups/pages/ServiceGroupDetailPage';
import { ServiceGroupMapPage } from '@/features/service-groups/pages/ServiceGroupMapPage';
import { UserListPage } from '@/features/users/pages/UserListPage';
import { FinancialEntriesPage } from '@/features/financial/pages/FinancialEntriesPage';
import { InvoicesPage } from '@/features/financial/pages/InvoicesPage';
import { TenantContactListPage } from '@/features/tenants/pages/TenantContactListPage';
import { TenantListPage } from '@/features/tenants/pages/TenantListPage';
import { TenantDetailPage } from '@/features/tenants/pages/TenantDetailPage';
import { ReportListPage } from '@/features/reports/pages/ReportListPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { PortalPage } from '@/features/tenant-portal/pages/PortalPage';
import { ServiceTypeListPage } from '@/features/service-types/pages/ServiceTypeListPage';
import { PricingRuleListPage } from '@/features/pricing-rules/pages/PricingRuleListPage';
import { AccountSettingsPage } from '@/features/settings/pages/AccountSettingsPage';
import { SecuritySettingsPage } from '@/features/settings/pages/SecuritySettingsPage';
import { AuditLogListPage } from '@/features/audit-logs/pages/AuditLogListPage';
import { AvailabilitySlotListPage } from '@/features/availability-slots/pages/AvailabilitySlotListPage';
import { NotificationTemplateListPage } from '@/features/notification-templates/pages/NotificationTemplateListPage';
import { MarketplacePage } from '@/features/marketplace/pages/MarketplacePage';
import { UserRole } from '@properfy/shared';
import { NotFoundPage } from './NotFoundPage';

function PortalRedirect() {
  const { token } = useParams();
  return <Navigate to={`/tenant-portal/${token}`} replace />;
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/tenant-portal/:token',
    element: <PortalPage />,
  },
  {
    path: '/portal/:token',
    element: <PortalRedirect />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          {
            path: 'appointments',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <AppointmentListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'appointments/new',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <AppointmentCreatePage />
              </AuthGuard>
            ),
          },
          {
            path: 'appointments/import',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <AppointmentImportPage />
              </AuthGuard>
            ),
          },
          {
            path: 'appointments/map',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <AppointmentMapPage />
              </AuthGuard>
            ),
          },
          {
            path: 'appointments/:id',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <AppointmentDetailPage />
              </AuthGuard>
            ),
          },
          {
            path: 'properties',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <PropertyListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'properties/new',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <PropertyCreatePage />
              </AuthGuard>
            ),
          },
          {
            path: 'properties/import',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <PropertyImportPage />
              </AuthGuard>
            ),
          },
          {
            path: 'properties/map',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <PropertyMapPage />
              </AuthGuard>
            ),
          },
          {
            path: 'properties/:id',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <PropertyDetailPage />
              </AuthGuard>
            ),
          },
          {
            path: 'service-groups',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceGroupListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'service-groups/new',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceGroupCreatePage />
              </AuthGuard>
            ),
          },
          {
            path: 'service-groups/:id',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceGroupDetailPage />
              </AuthGuard>
            ),
          },
          {
            path: 'service-groups/map',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceGroupMapPage />
              </AuthGuard>
            ),
          },
          {
            path: 'marketplace',
            element: (
              <AuthGuard roles={[UserRole.INSP]}>
                <MarketplacePage />
              </AuthGuard>
            ),
          },
          {
            path: 'availability-slots',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <AvailabilitySlotListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'financial',
            element: <AuthGuard roles={[UserRole.AM, UserRole.OP]} />,
            children: [
              { index: true, element: <Navigate to="/financial/entries" replace /> },
              { path: 'entries', element: <FinancialEntriesPage /> },
              { path: 'invoices', element: <InvoicesPage /> },
            ],
          },
          {
            path: 'inspectors',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <InspectorListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'tenant-contacts',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <TenantContactListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'tenants',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <TenantListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'tenants/:tenantId',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <TenantDetailPage />
              </AuthGuard>
            ),
          },
          {
            path: 'users',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <UserListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'reports',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ReportListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'service-types',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceTypeListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'pricing-rules',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <PricingRuleListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'notification-templates',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <NotificationTemplateListPage />
              </AuthGuard>
            ),
          },
          { path: 'settings', element: <Navigate to="/settings/account" replace /> },
          { path: 'settings/account', element: <AccountSettingsPage /> },
          { path: 'settings/security', element: <SecuritySettingsPage /> },
          {
            path: 'audit-logs',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <AuditLogListPage />
              </AuthGuard>
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
