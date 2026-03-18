import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PwaLayout } from '@/components/shell/PwaLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { InspectorAuthGuard } from './InspectorAuthGuard';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { SchedulePage } from '@/features/schedule/pages/SchedulePage';
import { AppointmentDetailPage } from '@/features/schedule/pages/AppointmentDetailPage';
import { ExecutionPage } from '@/features/execution/pages/ExecutionPage';
import { MarketplacePage } from '@/features/offers/pages/MarketplacePage';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import { EarningsPage } from '@/features/earnings/pages/EarningsPage';

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <i className="mdi mdi-hammer-wrench text-[48px] text-text-muted" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-text-primary">{title}</p>
      <p className="mt-1 text-sm text-text-secondary">Coming soon</p>
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
        element: <InspectorAuthGuard />,
        children: [
          {
            element: <PwaLayout />,
            children: [
              { index: true, element: <Navigate to="/schedule" replace /> },
              { path: 'schedule', element: <SchedulePage /> },
              { path: 'schedule/:appointmentId', element: <AppointmentDetailPage /> },
              { path: 'marketplace', element: <MarketplacePage /> },
              { path: 'map', element: <PlaceholderPage title="Map" /> },
              { path: 'earnings', element: <EarningsPage /> },
              { path: 'profile', element: <ProfilePage /> },
            ],
          },
          { path: 'execution/:appointmentId', element: <ExecutionPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/schedule" replace />,
  },
]);
