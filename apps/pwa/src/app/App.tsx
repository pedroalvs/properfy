import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/app/QueryProvider';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { InstallPromptProvider } from '@/app/useInstallPrompt';
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
          <InstallPromptProvider>
            <AuthProvider>
              <OfflineQueueSync />
              <Toaster position="top-center" richColors closeButton />
              <RouterProvider
                router={router}
                future={{ v7_startTransition: true }}
              />
            </AuthProvider>
          </InstallPromptProvider>
        </SnackbarProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
