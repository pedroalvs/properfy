import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../pages/LoginPage';
import { renderWithProviders } from '@/test-utils';
import { ApiError } from '@/lib/api-error';

const mockLogin = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockClear();
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    });
  });

  it('renders login form', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByTestId('email-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('login-button')).toBeInTheDocument();
  });

  it('submits form with credentials', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'inspector@test.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('inspector@test.com', 'password123', undefined);
    });
  });

  it('shows error on failed login', async () => {
    mockLogin.mockRejectedValue(new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS'));
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'wrong@test.com');
    await user.type(screen.getByTestId('password-input'), 'wrong');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeInTheDocument();
      expect(screen.getByText('Invalid email or password.')).toBeInTheDocument();
    });

    expect(screen.getByTestId('email-input')).toHaveValue('wrong@test.com');
    expect(screen.getByTestId('password-input')).toHaveValue('wrong');
  });

  it('shows locked account message when backend returns AUTH_ACCOUNT_LOCKED', async () => {
    mockLogin.mockRejectedValue(new ApiError(423, 'Locked', 'AUTH_ACCOUNT_LOCKED'));
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'locked@test.com');
    await user.type(screen.getByTestId('password-input'), 'wrong');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByText('Account locked. Please try again later.')).toBeInTheDocument();
    });
  });

  it('reveals the TOTP field when the backend requires two-factor authentication', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'TOTP required', 'AUTH_TOTP_REQUIRED'));
    mockLogin.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'inspector@test.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('totp-input')).toBeInTheDocument();
      expect(
        screen.getByText('Enter the 6-digit code from your authenticator app.'),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId('email-input')).toHaveValue('inspector@test.com');
    expect(screen.getByTestId('password-input')).toHaveValue('password123');

    await user.type(screen.getByTestId('totp-input'), '123456');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenLastCalledWith('inspector@test.com', 'password123', '123456');
    });
  });

  it('shows invalid TOTP message when the authentication code is wrong', async () => {
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'TOTP required', 'AUTH_TOTP_REQUIRED'));
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'Invalid TOTP', 'AUTH_TOTP_INVALID'));
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'inspector@test.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.click(screen.getByTestId('login-button'));

    await screen.findByTestId('totp-input');
    await user.type(screen.getByTestId('totp-input'), '654321');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByText('Invalid two-factor authentication code.')).toBeInTheDocument();
    });
  });

  it('redirects to /schedule when already authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@test.com', role: 'INSP', tenantId: null },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    });

    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
  });

  it('restores the previous route after authentication', async () => {
    sessionStorage.setItem('properfy:pwa:post-login-redirect', '/execution/apt-1?step=photos');
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@test.com', role: 'INSP', tenantId: null },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: mockLogin,
      logout: vi.fn(),
    });

    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

    await waitFor(() => {
      expect(sessionStorage.getItem('properfy:pwa:post-login-redirect')).toBeNull();
    });
  });

  it('shows access guidance for unsupported roles instead of redirecting', async () => {
    mockLogin.mockRejectedValue(
      new ApiError(403, 'This app is only available for inspectors.', 'AUTH_ROLE_NOT_SUPPORTED'),
    );
    const user = userEvent.setup();

    renderWithProviders(<LoginPage />);

    await user.type(screen.getByTestId('email-input'), 'admin@test.com');
    await user.type(screen.getByTestId('password-input'), 'password123');
    await user.click(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(
        screen.getByText(
          'This app is only available for inspectors. Use the web portal for admin or agency access.',
        ),
      ).toBeInTheDocument();
    });

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });
});
