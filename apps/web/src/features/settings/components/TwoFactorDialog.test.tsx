import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRefreshUser = vi.fn(() => Promise.resolve());
let mockUser: Record<string, unknown> = { id: 'u1', role: 'CL_ADMIN', totpEnabled: true };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser, refreshUser: mockRefreshUser }),
}));

const mockShowSuccess = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: vi.fn(), showInfo: vi.fn() }),
}));

const mockDisableTotp = vi.fn(() => Promise.resolve({ success: true }));
vi.mock('../hooks/useDisableTotp', () => ({
  useDisableTotp: () => ({ disableTotp: mockDisableTotp, isDisabling: false }),
}));

// Stub the enrolment steps so the test doesn't provision/QR-render.
vi.mock('./TotpEnrollmentSteps', () => ({
  TotpEnrollmentSteps: ({ onEnrolled }: { onEnrolled: () => void }) => (
    <button onClick={onEnrolled}>enroll-confirm</button>
  ),
}));

import { TwoFactorDialog } from './TwoFactorDialog';

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { id: 'u1', role: 'CL_ADMIN', totpEnabled: true };
});

function renderDialog() {
  const onClose = vi.fn();
  render(<TwoFactorDialog open onClose={onClose} />);
  return { onClose };
}

describe('TwoFactorDialog', () => {
  it('offers Reconfigure and Turn off when enabled for a non-AM user', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Reconfigure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeInTheDocument();
  });

  it('hides Turn off for AM (2FA mandatory)', () => {
    mockUser = { id: 'u1', role: 'AM', totpEnabled: true };
    renderDialog();
    expect(screen.getByRole('button', { name: 'Reconfigure' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });

  it('turns off after confirming the password', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    await user.type(screen.getByLabelText('Current password'), 'Secret1!');
    await user.click(screen.getByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(mockDisableTotp).toHaveBeenCalledWith('Secret1!'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('reconfigure disables then enrols a new authenticator', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Reconfigure' }));
    await user.type(screen.getByLabelText('Current password'), 'Secret1!');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(mockDisableTotp).toHaveBeenCalled());
    // Now on the enrolment step (stubbed).
    await user.click(screen.getByRole('button', { name: 'enroll-confirm' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it('opens straight into enrolment when 2FA is disabled', () => {
    mockUser = { id: 'u1', role: 'CL_ADMIN', totpEnabled: false };
    renderDialog();
    expect(screen.getByRole('button', { name: 'enroll-confirm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconfigure' })).not.toBeInTheDocument();
  });
});
