import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));

const setupTotp = vi.fn();
const confirmTotp = vi.fn();
vi.mock('@/features/settings/hooks/useTotpSetup', () => ({
  useTotpSetup: () => ({ setupTotp, isSettingUp: false, error: null }),
}));
vi.mock('@/features/settings/hooks/useTotpConfirm', () => ({
  useTotpConfirm: () => ({ confirmTotp, isConfirming: false }),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}));

// jsdom omits localStorage here, so mock the suggestion gate/snooze (its real
// storage behaviour is covered by totp-suggestion.test.ts).
const snoozeTotpSuggestion = vi.fn();
vi.mock('../lib/totp-suggestion', () => ({
  shouldSuggestTotp: (u: { role: string; totpEnabled?: boolean } | null) =>
    !!u && u.role !== 'AM' && u.totpEnabled !== true,
  snoozeTotpSuggestion: (id: string) => snoozeTotpSuggestion(id),
}));

import { TwoFactorSetupPage } from './TwoFactorSetupPage';

function render2fa() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TwoFactorSetupPage />
    </MemoryRouter>,
  );
}

const noopAuth = {
  user: null,
  isAuthenticated: false,
  pendingTotpSetup: null,
  setupPendingTotp: vi.fn(),
  confirmPendingTotp: vi.fn(),
  cancelTotpSetup: vi.fn(),
  refreshUser: vi.fn(),
};

describe('TwoFactorSetupPage — mandatory (AM)', () => {
  const setupPendingTotp = vi.fn();
  const confirmPendingTotp = vi.fn();

  beforeEach(() => {
    mockNavigate.mockReset();
    setupPendingTotp.mockReset();
    confirmPendingTotp.mockReset();
    sessionStorage.clear();
    setupPendingTotp.mockResolvedValue({ totpUri: 'otpauth://totp/x', secret: 'BASE32SECRET' });
    confirmPendingTotp.mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      ...noopAuth,
      pendingTotpSetup: { email: 'admin@example.com' },
      setupPendingTotp,
      confirmPendingTotp,
    });
  });

  it('shows the QR and secret, then walks scan → verify → confirm and navigates home', async () => {
    render2fa();

    // QR + secret appear after setup resolves.
    expect(await screen.findByTestId('totp-qr')).toBeInTheDocument();
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('BASE32SECRET');
    expect(setupPendingTotp).toHaveBeenCalledTimes(1);

    // Advance to verify step.
    fireEvent.click(screen.getByRole('button', { name: /i've scanned it/i }));
    const codeInput = await screen.findByLabelText('Authentication Code');

    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));

    await waitFor(() => {
      expect(confirmPendingTotp).toHaveBeenCalledWith('123456');
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('surfaces an expired-code error and stays on the verify step', async () => {
    const { ApiError } = await import('@/lib/api-error');
    confirmPendingTotp.mockRejectedValueOnce(new ApiError(401, 'invalid', 'AUTH_TOTP_INVALID'));
    render2fa();

    await screen.findByTestId('totp-qr');
    fireEvent.click(screen.getByRole('button', { name: /i've scanned it/i }));
    fireEvent.change(await screen.findByLabelText('Authentication Code'), {
      target: { value: '000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('TwoFactorSetupPage — optional (non-AM)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    setupTotp.mockReset();
    confirmTotp.mockReset();
    snoozeTotpSuggestion.mockReset();
    sessionStorage.clear();
    setupTotp.mockResolvedValue({ totpUri: 'otpauth://totp/y', secret: 'OPTSECRET' });
    mockUseAuth.mockReturnValue({
      ...noopAuth,
      isAuthenticated: true,
      user: { id: 'op-1', name: 'Op', email: 'op@example.com', role: 'OP', tenantId: 't1' },
    });
  });

  it('renders the single-pane suggestion with Skip and Enable', async () => {
    render2fa();
    expect(await screen.findByTestId('totp-qr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable 2fa/i })).toBeInTheDocument();
  });

  it('Skip snoozes the suggestion and navigates home', async () => {
    render2fa();
    await screen.findByTestId('totp-qr');
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(snoozeTotpSuggestion).toHaveBeenCalledWith('op-1');
  });

  it('Enable confirms via the real-token hook, refreshes the user, and navigates home', async () => {
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    mockUseAuth.mockReturnValue({
      ...noopAuth,
      isAuthenticated: true,
      user: { id: 'op-1', name: 'Op', email: 'op@example.com', role: 'OP', tenantId: 't1' },
      refreshUser,
    });
    confirmTotp.mockResolvedValueOnce({ success: true });
    render2fa();

    await screen.findByTestId('totp-qr');
    fireEvent.change(screen.getByLabelText('Authentication Code'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /enable 2fa/i }));

    await waitFor(() => {
      expect(confirmTotp).toHaveBeenCalledWith('654321');
      expect(refreshUser).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});

describe('TwoFactorSetupPage — guard', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('redirects to /login when there is nothing to enrol and no session', () => {
    mockUseAuth.mockReturnValue({ ...noopAuth });
    render2fa();
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  it('redirects an authenticated, already-enrolled user home', () => {
    mockUseAuth.mockReturnValue({
      ...noopAuth,
      isAuthenticated: true,
      user: { id: 'op-1', name: 'Op', email: 'op@example.com', role: 'OP', tenantId: 't1', totpEnabled: true },
    });
    render2fa();
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
