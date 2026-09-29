import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockResetTotp = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('../hooks/useResetUserTotp', () => ({
  useResetUserTotp: () => ({ resetTotp: mockResetTotp, isResetting: false }),
}));

const mockShowSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: vi.fn() }),
}));

import { UserResetTotpDialog } from './UserResetTotpDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserResetTotpDialog', () => {
  it('warns that an AM target must re-enrol at next login', () => {
    render(
      <UserResetTotpDialog open userId="u1" userName="Ada" userRole="AM" onClose={vi.fn()} />,
    );
    expect(screen.getByText(/required/i)).toBeInTheDocument();
    expect(screen.getByText(/set it up again/i)).toBeInTheDocument();
  });

  it('does not show the admin warning for a non-AM target', () => {
    render(
      <UserResetTotpDialog open userId="u1" userName="Bob" userRole="CL_USER" onClose={vi.fn()} />,
    );
    expect(screen.queryByText(/set it up again/i)).not.toBeInTheDocument();
  });

  it('resets and closes on confirm', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onReset = vi.fn();
    render(
      <UserResetTotpDialog open userId="u1" userName="Bob" userRole="CL_USER" onClose={onClose} onReset={onReset} />,
    );

    await user.click(screen.getByRole('button', { name: 'Reset 2FA' }));

    await waitFor(() => expect(mockResetTotp).toHaveBeenCalledWith('u1'));
    expect(mockShowSuccess).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
