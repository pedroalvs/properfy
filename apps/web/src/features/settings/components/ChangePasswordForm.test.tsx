import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); this.name = 'ApiError'; }
  },
}));

const showSuccess = vi.fn();
const showError = vi.fn();
const logout = vi.fn();
const changePassword = vi.fn();
const validate = vi.fn(() => ({}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ logout }),
}));

vi.mock('../hooks/useChangePassword', () => ({
  useChangePassword: () => ({
    changePassword,
    isChanging: false,
    validate,
  }),
}));

import { ChangePasswordForm } from './ChangePasswordForm';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  validate.mockReturnValue({});
  changePassword.mockResolvedValue({ success: true });
});

describe('ChangePasswordForm', () => {
  it('renders password fields', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><ChangePasswordForm /></Wrapper>);
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><ChangePasswordForm /></Wrapper>);
    expect(screen.getByRole('button', { name: /Change Password/ })).toBeInTheDocument();
  });

  it('logs out locally after successful password change', async () => {
    vi.useFakeTimers();
    const Wrapper = createWrapper();
    render(<Wrapper><ChangePasswordForm /></Wrapper>);

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'OldPass1!' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewPass2@' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewPass2@' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Change Password/ }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(changePassword).toHaveBeenCalled();
    expect(showSuccess).toHaveBeenCalledWith('Password changed. Please sign in again.');
    expect(logout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(logout).toHaveBeenCalled();
  });
});
