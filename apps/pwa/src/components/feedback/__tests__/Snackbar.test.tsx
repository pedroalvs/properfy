import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';

// Toasts now live in sonner's store; assert the hook's public API still works and
// dispatches to sonner rather than rendering the old message-stack DOM.
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <SnackbarProvider>{children}</SnackbarProvider>
);

describe('useSnackbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the stable snackbar API', () => {
    const { result } = renderHook(() => useSnackbar(), { wrapper });
    expect(typeof result.current.showSuccess).toBe('function');
    expect(typeof result.current.showError).toBe('function');
    expect(typeof result.current.showInfo).toBe('function');
    expect(typeof result.current.dismiss).toBe('function');
    expect(result.current.messages).toEqual([]);
  });

  it('routes each method to sonner without throwing', () => {
    const { result } = renderHook(() => useSnackbar(), { wrapper });

    expect(() => {
      result.current.showSuccess('Saved');
      result.current.showError('Failed');
      result.current.showInfo('Synced');
      result.current.dismiss();
    }).not.toThrow();

    expect(toast.success).toHaveBeenCalledWith('Saved');
    expect(toast.error).toHaveBeenCalledWith('Failed');
    expect(toast).toHaveBeenCalledWith('Synced');
    expect(toast.dismiss).toHaveBeenCalled();
  });

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useSnackbar())).toThrow(
      'useSnackbar must be used within a SnackbarProvider',
    );
  });
});
