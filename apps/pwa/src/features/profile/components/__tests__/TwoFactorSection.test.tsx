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

  it('uses a distinct set-up glyph so the wizard does not read as already-done', () => {
    // Enabled state renders the success shield-check.
    const { container: enabledEl } = render(<TwoFactorSection enabled onEnabled={vi.fn()} />);
    expect(enabledEl.querySelector('.lucide-shield-check')).toBeInTheDocument();

    // Mid-setup must NOT reuse that success glyph (it would read as "already enabled").
    mockUseTotpSetup.mockReturnValue({
      setupData: { secret: 'SECRET123', qrUri: 'otpauth://totp/test' },
      startSetup: vi.fn(),
      confirmSetup: vi.fn(),
      cancelSetup: vi.fn(),
      isSettingUp: false,
      isConfirming: false,
    });
    const { container: setupEl } = render(<TwoFactorSection enabled={false} onEnabled={vi.fn()} />);
    expect(setupEl.querySelector('.lucide-shield-plus')).toBeInTheDocument();
    expect(setupEl.querySelector('.lucide-shield-check')).not.toBeInTheDocument();
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

  it('blocks confirm and shows a validation message for a non-6-digit code', async () => {
    const confirmSetup = vi.fn().mockResolvedValue(undefined);
    mockUseTotpSetup.mockReturnValue({
      setupData: { secret: 'SECRET123', qrUri: 'otpauth://totp/test' },
      startSetup: vi.fn(),
      confirmSetup,
      cancelSetup: vi.fn(),
      isSettingUp: false,
      isConfirming: false,
    });

    render(<TwoFactorSection enabled={false} onEnabled={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & enable/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Enter the 6-digit code');
    });
    expect(confirmSetup).not.toHaveBeenCalled();
  });
});
