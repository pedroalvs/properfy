import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PwaLayout } from '@/components/shell/PwaLayout';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ProtectedRoute } from './ProtectedRoute';
import { InspectorAuthGuard } from './InspectorAuthGuard';

const LoginPage = lazy(() =>
  import('@/features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const AccessDeniedPage = lazy(() =>
  import('@/features/auth/pages/AccessDeniedPage').then((module) => ({ default: module.AccessDeniedPage })),
);
const DeactivatedPage = lazy(() =>
  import('@/features/auth/pages/DeactivatedPage').then((module) => ({ default: module.DeactivatedPage })),
);
const SchedulePage = lazy(() =>
  import('@/features/schedule/pages/SchedulePage').then((module) => ({
    default: module.SchedulePage,
  })),
);
const AppointmentDetailPage = lazy(() =>
  import('@/features/schedule/pages/AppointmentDetailPage').then((module) => ({
    default: module.AppointmentDetailPage,
  })),
);
const ExecutionPage = lazy(() =>
  import('@/features/execution/pages/ExecutionPage').then((module) => ({
    default: module.ExecutionPage,
  })),
);
const MarketplacePage = lazy(() =>
  import('@/features/offers/pages/MarketplacePage').then((module) => ({
    default: module.MarketplacePage,
  })),
);
const ProfilePage = lazy(() =>
  import('@/features/profile/pages/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
);
const EarningsPage = lazy(() =>
  import('@/features/earnings/pages/EarningsPage').then((module) => ({
    default: module.EarningsPage,
  })),
);
const DraftInvoiceScreen = lazy(() =>
  import('@/features/earnings/components/DraftInvoiceScreen').then((module) => ({
    default: module.DraftInvoiceScreen,
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
                { path: 'earnings/draft-invoice', element: lazyElement(DraftInvoiceScreen) },
                { path: 'profile', element: lazyElement(ProfilePage) },
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
