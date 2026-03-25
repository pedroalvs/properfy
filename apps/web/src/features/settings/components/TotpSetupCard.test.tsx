import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { AuthProvider } from '@/hooks/useAuth';

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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { authStorage } from '@/lib/auth-storage';
import { TotpSetupCard } from './TotpSetupCard';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockHasTokens = authStorage.hasTokens as ReturnType<typeof vi.fn>;
const mockGetAccessToken = authStorage.getAccessToken as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><AuthProvider><SnackbarProvider>{children}</SnackbarProvider></AuthProvider></QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasTokens.mockReturnValue(false);
  mockGetAccessToken.mockReturnValue(null);
  mockGet.mockReset();
});

describe('TotpSetupCard', () => {
  it('renders 2FA title', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><TotpSetupCard /></Wrapper>);
    expect(screen.getByText('Two-Factor Authentication')).toBeInTheDocument();
  });

  it('renders setup button', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><TotpSetupCard /></Wrapper>);
    expect(screen.getByText('Setup 2FA')).toBeInTheDocument();
  });

  it('renders description text', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><TotpSetupCard /></Wrapper>);
    expect(screen.getByText(/extra layer of security/)).toBeInTheDocument();
  });

  it('shows enabled state when TOTP is already enabled', async () => {
    mockHasTokens.mockReturnValue(true);
    mockGetAccessToken.mockReturnValue('token');
    mockGet.mockResolvedValue({
      data: {
        id: 'usr-1',
        name: 'Admin',
        email: 'admin@test.com',
        role: 'AM',
        tenantId: null,
        branchId: null,
        totpEnabled: true,
        phone: null,
        status: 'ACTIVE',
        lastLoginAt: null,
        createdAt: '2026-03-24T10:00:00Z',
      },
    });

    const Wrapper = createWrapper();
    render(<Wrapper><TotpSetupCard /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Two-factor authentication is enabled for this account.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Setup 2FA')).not.toBeInTheDocument();
  });
});
