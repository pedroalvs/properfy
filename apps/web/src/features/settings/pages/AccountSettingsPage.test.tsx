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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-99',
      name: 'Test Admin',
      email: 'test@test.com',
      role: 'AM',
      tenantId: 'tenant-1',
      phone: '+5511999999999',
      lastLoginAt: '2026-03-24T10:00:00Z',
    },
    token: 'mock-token', isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AccountSettingsPage } from './AccountSettingsPage';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>;
  };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('AccountSettingsPage', () => {
  it('renders page title', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><AccountSettingsPage /></Wrapper>);
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
  });

  it('renders profile section with user info', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><AccountSettingsPage /></Wrapper>);
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('test@test.com')).toBeInTheDocument();
    expect(screen.getByText('+5511999999999')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Last Login')).toBeInTheDocument();
  });

  it('renders change password form', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><AccountSettingsPage /></Wrapper>);
    const matches = screen.getAllByText('Change Password');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
