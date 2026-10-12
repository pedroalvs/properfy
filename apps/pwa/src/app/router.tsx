import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { retryLazyImportOnce } from '@properfy/shared';
import { PwaLayout } from '@/components/shell/PwaLayout';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ProtectedRoute } from './ProtectedRoute';
import { InspectorAuthGuard } from './InspectorAuthGuard';

/**
 * Handles stale chunk hashes after a new deployment: reloads the intended URL
 * once on the first import failure, then lets a repeated failure surface to
 * the error boundary. See retryLazyImportOnce in @properfy/shared.
 */
function lazyRetry<T extends { default: ComponentType<any> }>(importFn: () => Promise<T>) {
  return lazy(() => retryLazyImportOnce(importFn, window.sessionStorage, window.location, console));
}

const LoginPage = lazyRetry(() =>
  import('@/features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const ForgotPasswordPage = lazyRetry(() =>
  import('@/features/auth/pages/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazyRetry(() =>
  import('@/features/auth/pages/ResetPasswordPage').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);
const AccessDeniedPage = lazyRetry(() =>
  import('@/features/auth/pages/AccessDeniedPage').then((module) => ({ default: module.AccessDeniedPage })),
);
const DeactivatedPage = lazyRetry(() =>
  import('@/features/auth/pages/DeactivatedPage').then((module) => ({ default: module.DeactivatedPage })),
);
const SchedulePage = lazyRetry(() =>
  import('@/features/schedule/pages/SchedulePage').then((module) => ({
    default: module.SchedulePage,
  })),
);
const AppointmentDetailPage = lazyRetry(() =>
  import('@/features/schedule/pages/AppointmentDetailPage').then((module) => ({
    default: module.AppointmentDetailPage,
  })),
);
const ExecutionPage = lazyRetry(() =>
  import('@/features/execution/pages/ExecutionPage').then((module) => ({
    default: module.ExecutionPage,
  })),
);
const MarketplacePage = lazyRetry(() =>
  import('@/features/offers/pages/MarketplacePage').then((module) => ({
    default: module.MarketplacePage,
  })),
);
const ProfilePage = lazyRetry(() =>
  import('@/features/profile/pages/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
);
const ProfileAvailabilityPage = lazyRetry(() =>
  import('@/features/profile/pages/ProfileAvailabilityPage').then((module) => ({
    default: module.ProfileAvailabilityPage,
  })),
);
const ProfileDocumentsPage = lazyRetry(() =>
  import('@/features/profile/pages/ProfileDocumentsPage').then((module) => ({
    default: module.ProfileDocumentsPage,
  })),
);
const ProfileAccountPage = lazyRetry(() =>
  import('@/features/profile/pages/ProfileAccountPage').then((module) => ({
    default: module.ProfileAccountPage,
  })),
);
const ProfileSettingsPage = lazyRetry(() =>
  import('@/features/profile/pages/ProfileSettingsPage').then((module) => ({
    default: module.ProfileSettingsPage,
  })),
);
const EarningsPage = lazyRetry(() =>
  import('@/features/earnings/pages/EarningsPage').then((module) => ({
    default: module.EarningsPage,
  })),
);
const RequestInvoicePage = lazyRetry(() =>
  import('@/features/earnings/pages/RequestInvoicePage').then((module) => ({
    default: module.RequestInvoicePage,
  })),
);
const InvoiceListPage = lazyRetry(() =>
  import('@/features/earnings/pages/InvoiceListPage').then((module) => ({
    default: module.InvoiceListPage,
  })),
);
const InvoiceDetailPage = lazyRetry(() =>
  import('@/features/earnings/pages/InvoiceDetailPage').then((module) => ({
    default: module.InvoiceDetailPage,
  })),
);

function RouteLoader() {
  return (
    <div className="p-4">
      <LoadingState rows={6} />
    </div>
  );
}

function lazyElement(Component: ComponentType) {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: lazyElement(LoginPage),
    },
    {
      path: '/forgot-password',
      element: lazyElement(ForgotPasswordPage),
    },
    {
      path: '/reset-password',
      element: lazyElement(ResetPasswordPage),
    },
    {
      path: '/access-denied',
      element: lazyElement(AccessDeniedPage),
    },
    {
      path: '/deactivated',
      element: lazyElement(DeactivatedPage),
    },
    {
      element: <ProtectedRoute />,
      children: [
        {
          element: <InspectorAuthGuard />,
          children: [
            {
              element: <PwaLayout />,
              children: [
                { index: true, element: <Navigate to="/schedule" replace /> },
                { path: 'schedule', element: lazyElement(SchedulePage) },
                { path: 'schedule/:appointmentId', element: lazyElement(AppointmentDetailPage) },
                { path: 'marketplace', element: lazyElement(MarketplacePage) },
                { path: 'earnings', element: lazyElement(EarningsPage) },
                { path: 'earnings/request-invoice', element: lazyElement(RequestInvoicePage) },
                { path: 'earnings/invoices', element: lazyElement(InvoiceListPage) },
                { path: 'earnings/invoices/:invoiceId', element: lazyElement(InvoiceDetailPage) },
                { path: 'profile', element: lazyElement(ProfilePage) },
                { path: 'profile/availability', element: lazyElement(ProfileAvailabilityPage) },
                { path: 'profile/documents', element: lazyElement(ProfileDocumentsPage) },
                { path: 'profile/account', element: lazyElement(ProfileAccountPage) },
                { path: 'profile/settings', element: lazyElement(ProfileSettingsPage) },
                { path: 'profile/edit', element: <Navigate to="/profile/account" replace /> },
              ],
            },
            { path: 'execution/:appointmentId', element: lazyElement(ExecutionPage) },
          ],
        },
      ],
    },
    {
      path: '*',
      element: <Navigate to="/schedule" replace />,
    },
  ],
  {
    future: {
      v7_relativeSplatPath: true,
    },
  },
);
