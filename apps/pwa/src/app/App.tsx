import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/app/QueryProvider';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { SwUpdatePrompt } from '@/app/SwUpdatePrompt';
import { InstallPromptProvider } from '@/app/useInstallPrompt';
import { router } from '@/app/router';
import { useOfflineQueue } from '@/features/execution/hooks/useOfflineQueue';
import { registerSW } from 'virtual:pwa-register';

function ServiceWorkerRegistration() {
  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  return null;
}

function OfflineQueueSync() {
  useOfflineQueue();
  return null;
}

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <SnackbarProvider>
          <InstallPromptProvider>
            <AuthProvider>
              <ServiceWorkerRegistration />
              <OfflineQueueSync />
              <RouterProvider router={router} />
            </AuthProvider>
          </InstallPromptProvider>
          <Snackbar />
          <SwUpdatePrompt />
        </SnackbarProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
