import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';

const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));
vi.mock('@/services/api', () => ({ api: { POST: mockPost } }));

function apiSuccess() {
  return { data: null, error: undefined, response: new Response(null, { status: 204 }) };
}

function apiError(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message } }, response: new Response(null, { status }) };
}

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mockPost.mockReset();
  });

  it('renders email input and submit button', () => {
    renderPage();
    expect(screen.getByLabelText('Work Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });

  it('shows validation error when email is empty', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter your email address.',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows validation error when email format is invalid', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address.',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('shows loading state during request', async () => {
    let resolveRequest: (value: ReturnType<typeof apiSuccess>) => void;
    mockPost.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    const button = screen.getByRole('button', { name: /send reset link/i });
    expect(button).toBeDisabled();

    resolveRequest!(apiSuccess());
    await waitFor(() => {
      expect(button).not.toBeInTheDocument();
    });
  });

  it('shows success message after successful request', async () => {
    mockPost.mockResolvedValueOnce(apiSuccess());

    renderPage();
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send reset link/i })).not.toBeInTheDocument();
  });

  it('shows error message on API error', async () => {
    mockPost.mockResolvedValueOnce(apiError(500, 'INTERNAL_ERROR', 'Server error occurred'));

    renderPage();
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Server error. Please try again later.',
    );
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('shows rate limit error on 429 response', async () => {
    mockPost.mockResolvedValueOnce(apiError(429, 'RATE_LIMITED', 'Too many requests'));

    renderPage();
    fireEvent.change(screen.getByLabelText('Work Email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait and try again.',
    );
  });
});
