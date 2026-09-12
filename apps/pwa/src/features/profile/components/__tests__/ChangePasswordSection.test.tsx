import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ChangePasswordSection } from '../ChangePasswordSection';

const mockUseChangePassword = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../../hooks/useChangePassword', () => ({
  useChangePassword: () => mockUseChangePassword(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('ChangePasswordSection', () => {
  beforeEach(() => {
    mockUseChangePassword.mockReturnValue({
      changePassword: vi.fn().mockResolvedValue(undefined),
      isSubmitting: false,
    });
    mockUseAuth.mockReturnValue({
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs the user out after a successful password change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const logout = vi.fn();
    const changePassword = vi.fn().mockResolvedValue(undefined);
    mockUseChangePassword.mockReturnValue({ changePassword, isSubmitting: false });
    mockUseAuth.mockReturnValue({ logout });

    try {
      render(<ChangePasswordSection />);

      fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
      fireEvent.change(screen.getByPlaceholderText('Current password'), { target: { value: 'Oldpass1!' } });
      fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'Newpass1!' } });
      fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: 'Newpass1!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));

      await waitFor(() => {
        expect(changePassword).toHaveBeenCalledWith('Oldpass1!', 'Newpass1!');
      });

      await waitFor(() => {
        expect(screen.getByText(/You will be asked to sign in again/i)).toBeInTheDocument();
      });

      expect(logout).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1600);

      expect(logout).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
