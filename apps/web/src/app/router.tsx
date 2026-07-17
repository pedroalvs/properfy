import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { lazy, Suspense, type ComponentType } from 'react';
import { retryLazyImportOnce } from '@properfy/shared';

/**
 * Handles stale chunk hashes after a new deployment: reloads the intended URL
 * once on the first import failure, then lets a repeated failure surface to
 * the route error boundary. See retryLazyImportOnce in @properfy/shared.
 */
function lazyRetry<T extends { default: ComponentType<any> }>(importFn: () => Promise<T>) {
  return lazy(() => retryLazyImportOnce(importFn, window.sessionStorage, window.location, console));
}

const Loadable = (Component: any) => (props: any) => (
  <Suspense fallback={<div className="flex h-full w-full items-center justify-center p-8"><i className="mdi mdi-loading mdi-spin text-4xl text-primary" /></div>}>
    <Component {...props} />
  </Suspense>
);

const LoginPage = Loadable(lazyRetry(() => import('@/features/auth/pages/LoginPage').then(m => ({ default: m.LoginPage }))));
const ForgotPasswordPage = Loadable(lazyRetry(() => import('@/features/auth/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage }))));
const AppointmentListPage = Loadable(lazyRetry(() => import('@/features/appointments/pages/AppointmentListPage').then(m => ({ default: m.AppointmentListPage }))));
const AppointmentCreatePage = Loadable(lazyRetry(() => import('@/features/appointments/pages/AppointmentCreatePage').then(m => ({ default: m.AppointmentCreatePage }))));
const AppointmentDetailPage = Loadable(lazyRetry(() => import('@/features/appointments/pages/AppointmentDetailPage').then(m => ({ default: m.AppointmentDetailPage }))));
const AppointmentImportPage = Loadable(lazyRetry(() => import('@/features/appointments/pages/AppointmentImportPage').then(m => ({ default: m.AppointmentImportPage }))));
const PropertyListPage = Loadable(lazyRetry(() => import('@/features/properties/pages/PropertyListPage').then(m => ({ default: m.PropertyListPage }))));
const PropertyCreatePage = Loadable(lazyRetry(() => import('@/features/properties/pages/PropertyCreatePage').then(m => ({ default: m.PropertyCreatePage }))));
const PropertyDetailPage = Loadable(lazyRetry(() => import('@/features/properties/pages/PropertyDetailPage').then(m => ({ default: m.PropertyDetailPage }))));
const ContactListPage = Loadable(lazyRetry(() => import('@/features/contacts/pages/ContactListPage').then(m => ({ default: m.ContactListPage }))));
const ContactDetailPage = Loadable(lazyRetry(() => import('@/features/contacts/pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage }))));
const AppListPage = Loadable(lazyRetry(() => import('@/features/apps/pages/AppListPage').then(m => ({ default: m.AppListPage }))));
const InspectorListPage = Loadable(lazyRetry(() => import('@/features/inspectors/pages/InspectorListPage').then(m => ({ default: m.InspectorListPage }))));
const ServiceGroupListPage = Loadable(lazyRetry(() => import('@/features/service-groups/pages/ServiceGroupListPage').then(m => ({ default: m.ServiceGroupListPage }))));
const ServiceGroupCreatePage = Loadable(lazyRetry(() => import('@/features/service-groups/pages/ServiceGroupCreatePage').then(m => ({ default: m.ServiceGroupCreatePage }))));
const ServiceGroupDetailPage = Loadable(lazyRetry(() => import('@/features/service-groups/pages/ServiceGroupDetailPage').then(m => ({ default: m.ServiceGroupDetailPage }))));
const UserListPage = Loadable(lazyRetry(() => import('@/features/users/pages/UserListPage').then(m => ({ default: m.UserListPage }))));
const FinancialEntriesPage = Loadable(lazyRetry(() => import('@/features/financial/pages/FinancialEntriesPage').then(m => ({ default: m.FinancialEntriesPage }))));
const InvoicesPage = Loadable(lazyRetry(() => import('@/features/financial/pages/InvoicesPage').then(m => ({ default: m.InvoicesPage }))));
const AgencyFinancialPage = Loadable(lazyRetry(() => import('@/features/financial/pages/AgencyFinancialPage').then(m => ({ default: m.AgencyFinancialPage }))));
const TenantListPage = Loadable(lazyRetry(() => import('@/features/tenants/pages/TenantListPage').then(m => ({ default: m.TenantListPage }))));
const TenantDetailPage = Loadable(lazyRetry(() => import('@/features/tenants/pages/TenantDetailPage').then(m => ({ default: m.TenantDetailPage }))));
const ReportListPage = Loadable(lazyRetry(() => import('@/features/reports/pages/ReportListPage').then(m => ({ default: m.ReportListPage }))));
const DashboardPage = Loadable(lazyRetry(() => import('@/features/dashboard/pages/DashboardPage').then(m => ({ default: m.DashboardPage }))));
const PortalPage = Loadable(lazyRetry(() => import('@/features/rental-tenant-portal/pages/PortalPage').then(m => ({ default: m.PortalPage }))));
const ServiceTypeListPage = Loadable(lazyRetry(() => import('@/features/service-types/pages/ServiceTypeListPage').then(m => ({ default: m.ServiceTypeListPage }))));
const IntegrationsPage = Loadable(lazyRetry(() => import('@/features/integrations/pages/IntegrationsPage').then(m => ({ default: m.IntegrationsPage }))));
const PricingRuleListPage = Loadable(lazyRetry(() => import('@/features/pricing-rules/pages/PricingRuleListPage').then(m => ({ default: m.PricingRuleListPage }))));
const AccountSettingsPage = Loadable(lazyRetry(() => import('@/features/settings/pages/AccountSettingsPage').then(m => ({ default: m.AccountSettingsPage }))));
const SecuritySettingsPage = Loadable(lazyRetry(() => import('@/features/settings/pages/SecuritySettingsPage').then(m => ({ default: m.SecuritySettingsPage }))));
const AuditLogListPage = Loadable(lazyRetry(() => import('@/features/audit-logs/pages/AuditLogListPage').then(m => ({ default: m.AuditLogListPage }))));
const AvailabilitySlotListPage = Loadable(lazyRetry(() => import('@/features/availability-slots/pages/AvailabilitySlotListPage').then(m => ({ default: m.AvailabilitySlotListPage }))));
const NotificationTemplateListPage = Loadable(lazyRetry(() => import('@/features/notification-templates/pages/NotificationTemplateListPage').then(m => ({ default: m.NotificationTemplateListPage }))));
const ConsentLookupPage = Loadable(lazyRetry(() => import('@/features/notification-consents/pages/ConsentLookupPage').then(m => ({ default: m.ConsentLookupPage }))));
const MarketplacePage = Loadable(lazyRetry(() => import('@/features/marketplace/pages/MarketplacePage').then(m => ({ default: m.MarketplacePage }))));
const ServiceRegionListPage = Loadable(lazyRetry(() => import('@/features/service-regions/pages/ServiceRegionListPage').then(m => ({ default: m.ServiceRegionListPage }))));
const AppointmentMapPage = Loadable(lazyRetry(() => import('@/features/appointments/pages/AppointmentMapPage').then(m => ({ default: m.AppointmentMapPage }))));

import { ProtectedRoute } from './ProtectedRoute';
import { AuthGuard } from './AuthGuard';
import { AppShell } from '@/components/shell/AppShell';
import { UserRole } from '@properfy/shared';
import { NotFoundPage } from './NotFoundPage';
import { AppErrorBoundary } from '@/components/feedback/AppErrorBoundary';

function PortalRedirect() {
  const { token } = useParams();
  return <Navigate to={`/rental-tenant-portal/${token}`} replace />;
}

/**
 * `errorElement: <AppErrorBoundary />` on every top-level route entry
 * promotes our boundary instead of React Router's dev-only "Hey
 * developer 👋" placeholder. React Router resolves the closest
 * ancestor with `errorElement`, so attaching it at the layout level
 * inside `ProtectedRoute` is enough for every protected screen; the
 * public routes (login, portal) each take their own attachment.
 */
export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <AppErrorBoundary />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
    errorElement: <AppErrorBoundary />,
  },
  {
    path: '/rental-tenant-portal/:token',
    element: <PortalPage />,
    errorElement: <AppErrorBoundary />,
  },
  {
    // Legacy alias: magic links already sent point here → redirect to canonical.
    path: '/tenant-portal/:token',
    element: <PortalRedirect />,
    errorElement: <AppErrorBoundary />,
  },
  {
    path: '/portal/:token',
    element: <PortalRedirect />,
    errorElement: <AppErrorBoundary />,
  },
  {
    element: <ProtectedRoute />,
    errorElement: <AppErrorBoundary />,
    children: [
      {
        element: <AppShell />,
        errorElement: <AppErrorBoundary />,
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
            path: 'map',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <AppointmentMapPage />
              </AuthGuard>
            ),
          },
          {
            // Back-compat: the list moved from /appointments/list to /appointments.
            path: 'appointments/list',
            element: <Navigate to="/appointments" replace />,
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
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
                <AppointmentImportPage />
              </AuthGuard>
            ),
          },
          {
            // Back-compat: the map moved from /appointments to /map.
            path: 'appointments/map',
            element: <Navigate to="/map" replace />,
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
              // CL_USER is permitted by the canonical RBAC matrix (property.create, gated by the
              // create_properties flag enforced server-side), matching /properties and
              // /properties/:id. The backend rejects a flag-less CL_USER on submit.
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <PropertyCreatePage />
              </AuthGuard>
            ),
          },
          {
            // Legacy bookmark: the property map was removed; without this the
            // URL would fall through to properties/:id with id="map".
            path: 'properties/map',
            element: <Navigate to="/properties" replace />,
          },
          {
            // Legacy bookmark: the standalone property import was removed;
            // without this the URL would fall through to properties/:id
            // with id="import".
            path: 'properties/import',
            element: <Navigate to="/properties" replace />,
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
            path: 'contacts',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <ContactListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'contacts/:id',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <ContactDetailPage />
              </AuthGuard>
            ),
          },
          {
            path: 'apps',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <AppListPage />
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
            // Back-compat: the broken standalone service-groups map was removed.
            // The unified map's groups mode replaces it.
            path: 'service-groups/map',
            element: <Navigate to="/map?mode=groups" replace />,
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
            // 031 — Agency financial surface (read-only). CL_USER is admitted at the
            // route level and gated in-page by the `view_financials` flag (backend
            // also enforces it); mirrors the /properties/new precedent.
            path: 'my-financial',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN, UserRole.CL_USER]}>
                <AgencyFinancialPage />
              </AuthGuard>
            ),
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
            // Tenant LIST is platform-wide — backend `tenant.list` rejects
            // anything other than AM/OP. Letting CL_ADMIN through here would
            // render the page shell, fire the API call, and only then redirect
            // (the "brief flicker" the QA caught on 2026-04-20). Lock the
            // route to match the backend contract.
            path: 'tenants',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
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
              <AuthGuard roles={[UserRole.AM]}>
                <ServiceTypeListPage />
              </AuthGuard>
            ),
          },
          {
            path: 'integrations',
            element: (
              <AuthGuard roles={[UserRole.AM]}>
                <IntegrationsPage />
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
            path: 'service-regions',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ServiceRegionListPage />
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
          {
            path: 'notification-consents',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
                <ConsentLookupPage />
              </AuthGuard>
            ),
          },
          { path: 'settings', element: <Navigate to="/settings/account" replace /> },
          { path: 'settings/account', element: <AccountSettingsPage /> },
          { path: 'settings/security', element: <SecuritySettingsPage /> },
          {
            // CL_ADMIN audit read access shipped with feature 020 (closes
            // 011#GAP-002). Backend `ListAuditLogsUseCase` already serves
            // CL_ADMIN with tenant-scoped + PII-masked rows; the frontend
            // was lagging behind, hiding the page entirely for CL_ADMIN.
            // CL_USER stays out (backend returns 403).
            path: 'audit-logs',
            element: (
              <AuthGuard roles={[UserRole.AM, UserRole.OP, UserRole.CL_ADMIN]}>
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
    errorElement: <AppErrorBoundary />,
  },
], {
  future: {
    v7_relativeSplatPath: true,
  },
});
