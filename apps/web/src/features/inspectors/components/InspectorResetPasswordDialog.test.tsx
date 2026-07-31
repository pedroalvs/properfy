import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import type * as SnackbarModule from '@/hooks/useSnackbar';
import { InspectorResetPasswordDialog } from './InspectorResetPasswordDialog';

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

import { api } from '@/services/api';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

// SnackbarProvider renders no toast DOM, so an error assertion based on the page
// alone would also pass if the error were swallowed entirely.
const mockShowError = vi.fn();
const mockShowSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', async () => {
  const actual = await vi.importActual<typeof SnackbarModule>('@/hooks/useSnackbar');
  return {
    ...actual,
    useSnackbar: () => ({
      ...actual.useSnackbar(),
      showError: mockShowError,
      showSuccess: mockShowSuccess,
    }),
  };
});

function renderDialog(overrides: { onClose?: () => void; onReset?: () => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <InspectorResetPasswordDialog
          open={true}
          inspectorId="insp-01"
          inspectorName="Carlos Silva"
          onClose={overrides.onClose ?? vi.fn()}
          onReset={overrides.onReset ?? vi.fn()}
        />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('InspectorResetPasswordDialog', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockShowError.mockReset();
    mockShowSuccess.mockReset();
    mockPost.mockResolvedValue({ data: null, error: undefined });
  });

  it('validates required fields', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    expect(await screen.findAllByText('Required field')).toHaveLength(2);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('flags a password below the shared policy', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'weakpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  it('flags a confirmation mismatch', async () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewStrong1!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'Different1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    // Surfaced twice by design: live by PasswordStrengthIndicator and on submit
    // by the FormField error, same as the Users dialog.
    expect(await screen.findAllByText('Passwords do not match')).toHaveLength(2);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits a strong password to the inspector-scoped endpoint', async () => {
    // Inspector-scoped, with no tenant segment: inspector login accounts are
    // cross-tenant and the server resolves the linked user itself.
    const onReset = vi.fn();
    renderDialog({ onReset });

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewStrong1!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewStrong1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/inspectors/insp-01/reset-password',
        expect.objectContaining({ body: { newPassword: 'NewStrong1!' } }),
      );
    });
    await waitFor(() => expect(onReset).toHaveBeenCalled());
    expect(mockShowSuccess).toHaveBeenCalledWith(expect.stringContaining('Password reset'));
  });

  it('surfaces a server error without closing', async () => {
    const onClose = vi.fn();
    mockPost.mockResolvedValue({
      data: null,
      error: { error: { code: 'INSPECTOR_NO_LOGIN_ACCOUNT', message: 'This inspector has no linked login account' } },
    });
    renderDialog({ onClose });

    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'NewStrong1!' } });
    fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'NewStrong1!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Password' }));

    // Asserting the snackbar call, not just "the dialog stayed open" — the latter
    // would also hold if the error were swallowed and the operator told nothing.
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('This inspector has no linked login account'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });
});
