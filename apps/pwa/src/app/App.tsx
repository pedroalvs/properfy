import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/app/QueryProvider';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { SwUpdatePrompt } from '@/app/SwUpdatePrompt';
import { router } from '@/app/router';
import { useOfflineQueue } from '@/features/execution/hooks/useOfflineQueue';

function OfflineQueueSync() {
  useOfflineQueue();
  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <SnackbarProvider>
          <AuthProvider>
            <OfflineQueueSync />
            <RouterProvider router={router} />
          </AuthProvider>
          <Snackbar />
          <SwUpdatePrompt />
        </SnackbarProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
