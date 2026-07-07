import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PwaLayout } from '@/components/shell/PwaLayout';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ProtectedRoute } from './ProtectedRoute';
import { InspectorAuthGuard } from './InspectorAuthGuard';

const CHUNK_RELOAD_KEY = 'chunk_reload';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface LocationLike {
  href: string;
  assign(url: string): void;
}

interface LoggerLike {
  error(message: string, ...args: unknown[]): void;
}

/**
 * Handles stale chunk hashes after a new deployment: on the first import
 * failure it reloads the intended URL once; after that reload it retries the
 * import and lets a second failure surface to the error boundary. The guard
 * is cleared on success so each deployment gets its own reload attempt.
 */
export async function retryLazyImportOnce<T>(
  importFn: () => Promise<T>,
  storage: StorageLike = window.sessionStorage,
  location: LocationLike = window.location,
  logger: LoggerLike = console,
): Promise<T> {
  try {
    const module = await importFn();
    storage.removeItem(CHUNK_RELOAD_KEY);
    return module;
  } catch (error) {
    logger.error('Lazy route import failed', error);
    if (!storage.getItem(CHUNK_RELOAD_KEY)) {
      storage.setItem(CHUNK_RELOAD_KEY, '1');
      location.assign(location.href); // reload the intended URL, bypassing the failed chunk
      return new Promise<T>(() => {}); // never resolves — page is reloading
    }
    storage.removeItem(CHUNK_RELOAD_KEY);
    return importFn(); // second attempt after reload; failure reaches the error boundary
  }
}

function lazyRetry<T extends { default: ComponentType<any> }>(importFn: () => Promise<T>) {
  return lazy(() => retryLazyImportOnce(importFn));
}

const LoginPage = lazyRetry(() =>
  import('@/features/auth/pages/LoginPage').then((module) => ({ default: module.LoginPage })),
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
const ProfileEditPage = lazyRetry(() =>
  import('@/features/profile/pages/ProfileEditPage').then((module) => ({
    default: module.ProfileEditPage,
  })),
);
const EarningsPage = lazyRetry(() =>
  import('@/features/earnings/pages/EarningsPage').then((module) => ({
    default: module.EarningsPage,
  })),
);
const RequestInvoiceScreen = lazyRetry(() =>
  import('@/features/earnings/components/RequestInvoiceScreen').then((module) => ({
    default: module.RequestInvoiceScreen,
  })),
);
const InvoiceListScreen = lazyRetry(() =>
  import('@/features/earnings/pages/InvoiceListScreen').then((module) => ({
    default: module.InvoiceListScreen,
  })),
);
const InvoiceDetailScreen = lazyRetry(() =>
  import('@/features/earnings/pages/InvoiceDetailScreen').then((module) => ({
    default: module.InvoiceDetailScreen,
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
                { path: 'earnings/request-invoice', element: lazyElement(RequestInvoiceScreen) },
                { path: 'earnings/invoices', element: lazyElement(InvoiceListScreen) },
                { path: 'earnings/invoices/:invoiceId', element: lazyElement(InvoiceDetailScreen) },
                { path: 'profile', element: lazyElement(ProfilePage) },
                { path: 'profile/edit', element: lazyElement(ProfileEditPage) },
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
