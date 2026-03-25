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
      expect(mockLogin).toHaveBeenCalledWith('inspector@test.com', 'password123');
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
});
