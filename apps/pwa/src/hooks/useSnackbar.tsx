import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

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
  dismiss: (id: number) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<SnackbarMessage[]>([]);
  const nextId = useRef(0);

  const addMessage = useCallback((type: SnackbarType, message: string) => {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const showSuccess = useCallback((msg: string) => addMessage('success', msg), [addMessage]);
  const showError = useCallback((msg: string) => addMessage('error', msg), [addMessage]);
  const showInfo = useCallback((msg: string) => addMessage('info', msg), [addMessage]);

  const dismiss = useCallback((id: number) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <SnackbarContext.Provider value={{ messages, showSuccess, showError, showInfo, dismiss }}>
      {children}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return ctx;
}
