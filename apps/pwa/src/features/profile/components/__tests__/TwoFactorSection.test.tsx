import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TwoFactorSection } from '../TwoFactorSection';

const mockUseTotpSetup = vi.fn();

vi.mock('../../hooks/useTotpSetup', () => ({
  useTotpSetup: () => mockUseTotpSetup(),
}));

describe('TwoFactorSection', () => {
  beforeEach(() => {
    mockUseTotpSetup.mockReturnValue({
      setupData: null,
      startSetup: vi.fn(),
      confirmSetup: vi.fn(),
      cancelSetup: vi.fn(),
      isSettingUp: false,
      isConfirming: false,
    });
  });

  it('shows the enabled state when 2FA is already active', () => {
    render(<TwoFactorSection enabled onEnabled={vi.fn()} />);

    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('confirms setup with a verification code', async () => {
    const onEnabled = vi.fn();
    const confirmSetup = vi.fn().mockResolvedValue(undefined);
    mockUseTotpSetup.mockReturnValue({
      setupData: { secret: 'SECRET123', qrUri: 'otpauth://totp/test' },
      startSetup: vi.fn(),
      confirmSetup,
      cancelSetup: vi.fn(),
      isSettingUp: false,
      isConfirming: false,
    });

    render(<TwoFactorSection enabled={false} onEnabled={onEnabled} />);
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }));

    await waitFor(() => {
      expect(confirmSetup).toHaveBeenCalledWith('123456');
      expect(onEnabled).toHaveBeenCalled();
    });
  });
});
