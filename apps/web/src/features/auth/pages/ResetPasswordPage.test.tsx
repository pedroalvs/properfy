import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPasswordPage } from './ResetPasswordPage';

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock('@/services/api', () => ({ api: { POST: mockPost } }));

function apiSuccess() {
  return { data: null, error: undefined, response: new Response(null, { status: 204 }) };
}

function apiError(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message } }, response: new Response(null, { status }) };
}

function renderPage(initialEntry = '/reset-password?token=valid-token-123') {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <ResetPasswordPage />
    </MemoryRouter>,
  );
}

function fillPasswords(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: confirm } });
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('renders password fields and submit button when token is present', () => {
    renderPage();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows invalid-link state when token is missing', () => {
    renderPage('/reset-password');
    expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('New Password')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
  });

  it('shows validation error for weak password without calling the API', async () => {
    renderPage();
    fillPasswords('weakpass');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/uppercase, lowercase, number and special/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows validation error when passwords do not match', async () => {
    renderPage();
    fillPasswords('Str0ng!Pass', 'Different!1');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect((await screen.findAllByText('Passwords do not match')).length).toBeGreaterThan(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits token and new password, then shows success state', async () => {
    mockPost.mockResolvedValueOnce(apiSuccess());

    renderPage();
    fillPasswords('Str0ng!Pass');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument();

    expect(mockPost).toHaveBeenCalledWith('/v1/auth/reset-password', {
      body: { token: 'valid-token-123', newPassword: 'Str0ng!Pass' },
    });
  });

  it('shows expired-link message with request-new-link action on invalid token', async () => {
    mockPost.mockResolvedValueOnce(
      apiError(400, 'AUTH_INVALID_RESET_TOKEN', 'Password reset token is invalid, expired, or already used'),
    );

    renderPage();
    fillPasswords('Str0ng!Pass');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/i);
    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
  });

  it('shows rate limit error on 429 response', async () => {
    mockPost.mockResolvedValueOnce(apiError(429, 'RATE_LIMITED', 'Too many requests'));

    renderPage();
    fillPasswords('Str0ng!Pass');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait and try again.',
    );
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveRequest: (value: ReturnType<typeof apiSuccess>) => void;
    mockPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderPage();
    fillPasswords('Str0ng!Pass');
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled();

    resolveRequest!(apiSuccess());
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument();
    });
  });
});
