import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../ForgotPasswordPage';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
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

describe('ForgotPasswordPage (PWA)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('renders email input and submit button', () => {
    renderPage();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toBeInTheDocument();
  });

  it('shows validation error when email is invalid', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please enter a valid email address.',
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('submits email and shows generic success state', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'insp@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/insp@example\.com/)).toBeInTheDocument();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'insp@example.com' }),
      }),
    );
  });

  it('shows rate limit error on 429 response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'insp@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Please wait and try again.',
    );
  });
});
