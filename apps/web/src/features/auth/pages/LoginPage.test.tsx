import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const mockLogin = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

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

function renderLogin() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockNavigate.mockReset();
    mockUseAuth.mockReset();
    sessionStorage.clear();
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      logout: vi.fn(),
    });
  });

  it('renders email and password fields and submit button', () => {
    renderLogin();
    expect(screen.getByLabelText('Work Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByText(/secure sign in/i)).toBeInTheDocument();
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
    mockLogin.mockResolvedValueOnce(undefined);
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

  it('restores a persisted route after successful login', async () => {
    sessionStorage.setItem('properfy:web:post-login-redirect', '/appointments/123?tab=timeline');
    mockLogin.mockResolvedValueOnce(undefined);
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
      expect(sessionStorage.getItem('properfy:web:post-login-redirect')).toBeNull();
    });
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
      .mockResolvedValueOnce(undefined);
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
