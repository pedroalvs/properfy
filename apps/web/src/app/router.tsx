const Loadable = (Component: any) => (props: any) => (
  <Suspense fallback={<div className="flex h-full w-full items-center justify-center p-8"><i className="mdi mdi-loading mdi-spin text-4xl text-primary" /></div>}>
    <Component {...props} />
  </Suspense>
);

const LoginPage = Loadable(lazy(() => import('@/features/auth/pages/LoginPage').then(m => ({ default: m.LoginPage }))));
const AppointmentListPage = Loadable(lazy(() => import('@/features/appointments/pages/AppointmentListPage').then(m => ({ default: m.AppointmentListPage }))));
const AppointmentCreatePage = Loadable(lazy(() => import('@/features/appointments/pages/AppointmentCreatePage').then(m => ({ default: m.AppointmentCreatePage }))));
const AppointmentDetailPage = Loadable(lazy(() => import('@/features/appointments/pages/AppointmentDetailPage').then(m => ({ default: m.AppointmentDetailPage }))));
const AppointmentImportPage = Loadable(lazy(() => import('@/features/appointments/pages/AppointmentImportPage').then(m => ({ default: m.AppointmentImportPage }))));
const PropertyListPage = Loadable(lazy(() => import('@/features/properties/pages/PropertyListPage').then(m => ({ default: m.PropertyListPage }))));
const PropertyCreatePage = Loadable(lazy(() => import('@/features/properties/pages/PropertyCreatePage').then(m => ({ default: m.PropertyCreatePage }))));
const PropertyDetailPage = Loadable(lazy(() => import('@/features/properties/pages/PropertyDetailPage').then(m => ({ default: m.PropertyDetailPage }))));
const PropertyImportPage = Loadable(lazy(() => import('@/features/properties/pages/PropertyImportPage').then(m => ({ default: m.PropertyImportPage }))));
const InspectorListPage = Loadable(lazy(() => import('@/features/inspectors/pages/InspectorListPage').then(m => ({ default: m.InspectorListPage }))));
const ServiceGroupListPage = Loadable(lazy(() => import('@/features/service-groups/pages/ServiceGroupListPage').then(m => ({ default: m.ServiceGroupListPage }))));
const ServiceGroupCreatePage = Loadable(lazy(() => import('@/features/service-groups/pages/ServiceGroupCreatePage').then(m => ({ default: m.ServiceGroupCreatePage }))));
const ServiceGroupDetailPage = Loadable(lazy(() => import('@/features/service-groups/pages/ServiceGroupDetailPage').then(m => ({ default: m.ServiceGroupDetailPage }))));
const UserListPage = Loadable(lazy(() => import('@/features/users/pages/UserListPage').then(m => ({ default: m.UserListPage }))));
const FinancialEntriesPage = Loadable(lazy(() => import('@/features/financial/pages/FinancialEntriesPage').then(m => ({ default: m.FinancialEntriesPage }))));
const InvoicesPage = Loadable(lazy(() => import('@/features/financial/pages/InvoicesPage').then(m => ({ default: m.InvoicesPage }))));
const TenantContactListPage = Loadable(lazy(() => import('@/features/tenants/pages/TenantContactListPage').then(m => ({ default: m.TenantContactListPage }))));
const TenantListPage = Loadable(lazy(() => import('@/features/tenants/pages/TenantListPage').then(m => ({ default: m.TenantListPage }))));
const TenantDetailPage = Loadable(lazy(() => import('@/features/tenants/pages/TenantDetailPage').then(m => ({ default: m.TenantDetailPage }))));
const ReportListPage = Loadable(lazy(() => import('@/features/reports/pages/ReportListPage').then(m => ({ default: m.ReportListPage }))));
const DashboardPage = Loadable(lazy(() => import('@/features/dashboard/pages/DashboardPage').then(m => ({ default: m.DashboardPage }))));
const PortalPage = Loadable(lazy(() => import('@/features/tenant-portal/pages/PortalPage').then(m => ({ default: m.PortalPage }))));
const ServiceTypeListPage = Loadable(lazy(() => import('@/features/service-types/pages/ServiceTypeListPage').then(m => ({ default: m.ServiceTypeListPage }))));
const PricingRuleListPage = Loadable(lazy(() => import('@/features/pricing-rules/pages/PricingRuleListPage').then(m => ({ default: m.PricingRuleListPage }))));
const AccountSettingsPage = Loadable(lazy(() => import('@/features/settings/pages/AccountSettingsPage').then(m => ({ default: m.AccountSettingsPage }))));
const SecuritySettingsPage = Loadable(lazy(() => import('@/features/settings/pages/SecuritySettingsPage').then(m => ({ default: m.SecuritySettingsPage }))));
const AuditLogListPage = Loadable(lazy(() => import('@/features/audit-logs/pages/AuditLogListPage').then(m => ({ default: m.AuditLogListPage }))));
const AvailabilitySlotListPage = Loadable(lazy(() => import('@/features/availability-slots/pages/AvailabilitySlotListPage').then(m => ({ default: m.AvailabilitySlotListPage }))));
const NotificationTemplateListPage = Loadable(lazy(() => import('@/features/notification-templates/pages/NotificationTemplateListPage').then(m => ({ default: m.NotificationTemplateListPage }))));
const MarketplacePage = Loadable(lazy(() => import('@/features/marketplace/pages/MarketplacePage').then(m => ({ default: m.MarketplacePage }))));
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense, type ComponentType } from 'react';


import { ProtectedRoute } from './ProtectedRoute';
import { AuthGuard } from './AuthGuard';
import { AppShell } from '@/components/shell/AppShell';

































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
                <Navigate to="/appointments" replace />
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
                <Navigate to="/properties" replace />
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
                <Navigate to="/service-groups" replace />
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
