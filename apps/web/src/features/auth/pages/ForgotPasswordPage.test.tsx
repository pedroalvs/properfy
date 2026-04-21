import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    mockFetch.mockReset();
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
    expect(mockFetch).not.toHaveBeenCalled();
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
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows loading state during request', async () => {
    let resolveRequest: (value: Response) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
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

    resolveRequest!(new Response(null, { status: 204 }));
    await waitFor(() => {
      expect(button).not.toBeInTheDocument();
    });
  });

  it('shows success message after successful request', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

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
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Server error occurred' } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

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
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );

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
