import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';

type SnackbarType = 'success' | 'error' | 'info';

interface SnackbarMessage {
  id: number;
  type: SnackbarType;
  message: string;
}

interface SnackbarContextValue {
  messages: SnackbarMessage[];
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  dismiss: (id?: string | number) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const value = useMemo<SnackbarContextValue>(
    () => ({
      // Toasts now live in sonner's own store, so the legacy message stack is empty.
      messages: [],
      showSuccess: (message: string) => toast.success(message),
      showError: (message: string) => toast.error(message),
      showInfo: (message: string) => toast(message),
      dismiss: (id?: string | number) => toast.dismiss(id),
    }),
    [],
  );

  // The <Toaster> is mounted once at the app root (app/App.tsx), NOT here — mounting it in
  // this context provider would inject sonner's <section> into every renderWithProviders test.
  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>;
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return ctx;
}
