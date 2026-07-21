import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from '../ForgotPasswordPage';

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

describe('ForgotPasswordPage (PWA)', () => {
  beforeEach(() => {
    mockPost.mockReset();
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
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('submits email and shows generic success state', async () => {
    mockPost.mockResolvedValueOnce(apiSuccess());

    renderPage();
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'insp@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/insp@example\.com/)).toBeInTheDocument();

    expect(mockPost).toHaveBeenCalledWith('/v1/auth/forgot-password', {
      body: { email: 'insp@example.com' },
    });
  });

  it('shows rate limit error on 429 response', async () => {
    mockPost.mockResolvedValueOnce(apiError(429, 'RATE_LIMITED', 'Too many requests'));

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
