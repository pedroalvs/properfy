import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { AuthProvider } from '@/hooks/useAuth';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

import { SecuritySettingsPage } from './SecuritySettingsPage';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><AuthProvider><SnackbarProvider>{children}</SnackbarProvider></AuthProvider></QueryClientProvider>;
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('SecuritySettingsPage', () => {
  it('renders page title', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SecuritySettingsPage /></Wrapper>);
    expect(screen.getByText('Security Settings')).toBeInTheDocument();
  });

  it('renders 2FA section', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SecuritySettingsPage /></Wrapper>);
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
  });

  it('renders sessions section', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SecuritySettingsPage /></Wrapper>);
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });
});
