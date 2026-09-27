import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock the suggestion gate so the routing tests don't depend on real localStorage
// (jsdom omits it here) — snooze behaviour has its own dedicated test.
vi.mock('../lib/totp-suggestion', () => ({
  shouldSuggestTotp: (u: { role: string; totpEnabled?: boolean } | null) =>
    !!u && u.role !== 'AM' && u.totpEnabled !== true,
}));

function renderLogin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginPage />
    </MemoryRouter>,
  );
}

// useAuth is mocked, so isAuthenticated never flips on its own the way the real
// AuthProvider would after a successful login() call. This mutable flag lets
// tests simulate that flip (mockLogin sets it), so the LoginPage's own
// isAuthenticated-effect — the ONLY place that should consume and navigate to
// the stored post-login redirect — actually runs, the same way it does against
// the real auth context.
let authIsAuthenticated = false;
let authUser: { id: string; role: string; totpEnabled?: boolean } | null = null;
let authPendingTotpSetup: { email: string } | null = null;

function setupAuthMock() {
  mockUseAuth.mockImplementation(() => ({
    login: mockLogin,
    user: authUser,
    token: null,
    isAuthenticated: authIsAuthenticated,
    isLoading: false,
    logout: vi.fn(),
    pendingTotpSetup: authPendingTotpSetup,
  }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    sessionStorage.clear();
    authIsAuthenticated = false;
    authUser = null;
    authPendingTotpSetup = null;
    setupAuthMock();
  });

  it('renders email and password fields and submit button', () => {
    renderLogin();
    expect(screen.getByLabelText('Work Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    // Replaced the old "Secure Sign In" eyebrow, which the redesign drops.
    expect(
      screen.getByRole('heading', { level: 1, name: /we are properfy/i }),
    ).toBeInTheDocument();
  });

  it('shows error when fields are empty', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your email and password.',
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login and navigates on success', async () => {
    mockLogin.mockImplementationOnce(async () => {
      authIsAuthenticated = true;
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123', undefined);
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('restores a persisted route after successful login, consuming it exactly once', async () => {
    sessionStorage.setItem('properfy:web:post-login-redirect', '/appointments/123?tab=timeline');
    mockLogin.mockImplementationOnce(async () => {
      authIsAuthenticated = true;
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/appointments/123?tab=timeline', { replace: true });
    });

    // The double-consume bug: a second consumption site (the old submit-success
    // handler) would find the redirect already cleared by the effect and fall
    // back to navigating to '/', clobbering the correct destination. Asserting
    // a single call — not just "called with" — is what catches that regression.
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('properfy:web:post-login-redirect')).toBeNull();
  });

  it('shows error message on invalid credentials', async () => {
    const { ApiError } = await import('@/lib/api-error');
    mockLogin.mockRejectedValueOnce(
      new ApiError(401, 'Invalid credentials', 'AUTH_INVALID_CREDENTIALS'),
    );
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password.',
    );
  });

  it('disables button and shows spinner during submission', async () => {
    let resolveLogin: () => void;
    mockLogin.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    const button = screen.getByRole('button', { name: /sign in/i });
    expect(button).toBeDisabled();

    resolveLogin!();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('reveals totp input when backend requires two-factor authentication', async () => {
    const { ApiError } = await import('@/lib/api-error');
    mockLogin
      .mockRejectedValueOnce(new ApiError(401, 'TOTP required', 'AUTH_TOTP_REQUIRED'))
      .mockImplementationOnce(async () => {
        authIsAuthenticated = true;
      });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the 6-digit code from your authenticator app.',
    );
    expect(await screen.findByLabelText('Authentication Code')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Authentication Code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenNthCalledWith(1, 'test@example.com', 'password123', undefined);
      expect(mockLogin).toHaveBeenNthCalledWith(2, 'test@example.com', 'password123', '123456');
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('routes an admin owing 2FA enrolment to the setup screen (no dead-end message)', async () => {
    // The account owes mandatory enrolment: login resolves (no throw) and the
    // auth context exposes pendingTotpSetup.
    mockLogin.mockImplementationOnce(async () => {
      authPendingTotpSetup = { email: 'admin@example.com' };
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/2fa-setup', { replace: true });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('routes an unenrolled non-AM user to the optional 2FA suggestion', async () => {
    mockLogin.mockImplementationOnce(async () => {
      authIsAuthenticated = true;
      authUser = { id: 'op-1', role: 'OP' };
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'op@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/2fa-setup', { replace: true });
    });
  });

  it('sends an already-enrolled non-AM (used a code) straight to the app', async () => {
    const { ApiError } = await import('@/lib/api-error');
    mockLogin
      .mockRejectedValueOnce(new ApiError(403, 'TOTP required', 'AUTH_TOTP_REQUIRED'))
      .mockImplementationOnce(async () => {
        authIsAuthenticated = true;
        authUser = { id: 'op-1', role: 'OP', totpEnabled: true };
      });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Work Email'), { target: { value: 'op@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    fireEvent.change(await screen.findByLabelText('Authentication Code'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('redirects authenticated users away from the login page', async () => {
    sessionStorage.setItem('properfy:web:post-login-redirect', '/appointments?status=DONE');
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: { id: 'user-1', role: 'AM' },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });

    renderLogin();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/appointments?status=DONE', { replace: true });
    });
  });
});
