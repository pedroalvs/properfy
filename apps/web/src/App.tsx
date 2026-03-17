import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { QueryProvider } from '@/app/QueryProvider';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';
import { router } from '@/app/router';

export function App() {
  return (
    <QueryProvider>
      <SnackbarProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
        <Snackbar />
      </SnackbarProvider>
    </QueryProvider>
  );
}
