import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => 'mock-token'),
    hasTokens: vi.fn(() => true),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { UserListPage } from './UserListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ME = { id: 'usr-99', name: 'Test Admin', email: 'admin@test.com', role: 'AM', tenantId: 'tenant-1', branchId: null, totpEnabled: false };

const MOCK_USERS = [
  { id: 'usr-01', name: 'Main Admin', email: 'admin@properfy.com', role: 'AM', status: 'ACTIVE' },
  { id: 'usr-02', name: 'Ana Manager', email: 'ana@agency.com', role: 'CL_ADMIN', status: 'ACTIVE' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>{children}</SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/me') {
      return Promise.resolve({ data: MOCK_ME, error: undefined });
    }
    return Promise.resolve({ data: {
      data: MOCK_USERS,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    } });
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><UserListPage /></Wrapper>);
}

describe('UserListPage', () => {
  it('renders page title "Users"', () => {
    renderPage();
    expect(screen.getByText('Users')).toBeInTheDocument();
  });

  it('renders "New User" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New User');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search, role, and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Role').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByLabelText('Status').length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table with user data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Main Admin')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    const nameMatches = screen.getAllByText('Name');
    expect(nameMatches.length).toBeGreaterThanOrEqual(1);
  });
});
