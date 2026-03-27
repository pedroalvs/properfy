import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/app/QueryProvider';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { LocaleProvider } from '@/hooks/useLocale';
import { router } from '@/app/router';

export function App() {
  return (
    <LocaleProvider>
    <ErrorBoundary>
      <QueryProvider>
        <SnackbarProvider>
          <AuthProvider>
            <RouterProvider
              router={router}
              future={{ v7_startTransition: true }}
            />
          </AuthProvider>
          <Snackbar />
        </SnackbarProvider>
      </QueryProvider>
    </ErrorBoundary>
    </LocaleProvider>
  );
}
