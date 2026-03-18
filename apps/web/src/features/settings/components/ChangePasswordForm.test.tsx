import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); this.name = 'ApiError'; }
  },
}));

import { ChangePasswordForm } from './ChangePasswordForm';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>;
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('ChangePasswordForm', () => {
  it('renders password fields', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><ChangePasswordForm /></Wrapper>);
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders submit button', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><ChangePasswordForm /></Wrapper>);
    expect(screen.getByRole('button', { name: /Change Password/ })).toBeInTheDocument();
  });
});
