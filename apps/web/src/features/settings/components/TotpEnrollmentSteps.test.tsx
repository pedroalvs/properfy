import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const mockShowError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: mockShowError }),
}));

import { api } from '@/services/api';
import { TotpEnrollmentSteps } from './TotpEnrollmentSteps';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPost.mockReset();
  // First call: /2fa/setup provisions; later: /2fa/confirm.
  mockPost.mockImplementation((path: string) => {
    if (path === '/v1/auth/2fa/setup') {
      return Promise.resolve({
        data: { qrUri: 'otpauth://totp/Properfy:u@x?secret=ABC123', secret: 'ABC123' },
        error: undefined,
        response: { status: 200 },
      });
    }
    return Promise.resolve({ error: undefined, response: { status: 204 } });
  });
});

describe('TotpEnrollmentSteps', () => {
  it('provisions a secret on mount and confirms the code', async () => {
    const user = userEvent.setup();
    const onEnrolled = vi.fn();
    render(<TotpEnrollmentSteps onEnrolled={onEnrolled} onCancel={vi.fn()} />);

    // Secret shown once provisioning resolves.
    await waitFor(() => expect(screen.getByTestId('totp-secret')).toHaveTextContent('ABC123'));

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onEnrolled).toHaveBeenCalled());
    expect(mockPost).toHaveBeenCalledWith('/v1/auth/2fa/confirm', expect.anything());
  });

  it('shows a validation error for a short code without calling confirm', async () => {
    const user = userEvent.setup();
    const onEnrolled = vi.fn();
    render(<TotpEnrollmentSteps onEnrolled={onEnrolled} onCancel={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId('totp-secret')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Verification code'), '12');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(screen.getByText('Enter a 6-digit code')).toBeInTheDocument();
    expect(onEnrolled).not.toHaveBeenCalled();
  });
});
