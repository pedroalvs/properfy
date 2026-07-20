import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { UserResetPasswordDialog } from './UserResetPasswordDialog';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Platform Admin', email: 'admin@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

import { api } from '@/services/api';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <UserResetPasswordDialog
          open={true}
          userId="user-1"
          userName="Ana User"
          tenantId="tenant-1"
          onClose={vi.fn()}
          onReset={vi.fn()}
        />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('UserResetPasswordDialog', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPost.mockResolvedValue({ data: null, error: undefined });
  });

  it('validates required and matching fields', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findAllByText('Required field')).toHaveLength(2);
  });

  it('submits strong password to reset endpoint', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('New Password'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.change(screen.getByLabelText('Confirm Password'), {
      target: { value: 'NewStrong1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/tenants/tenant-1/users/user-1/reset-password',
        expect.objectContaining({
          body: { newPassword: 'NewStrong1!' },
        }),
      );
    });
  });
});
