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
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { TenantContactListPage } from './TenantContactListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_CONTACTS = [
  { id: 'tnt-01', name: 'Ana Silva', email: 'ana.silva@email.com', phone: '11999999999', confirmationStatus: 'CONFIRMED', appointmentDate: '2026-04-01' },
  { id: 'tnt-02', name: 'Bruno Santos', email: 'bruno@email.com', phone: '11888888888', confirmationStatus: 'NO_RESPONSE', appointmentDate: '2026-04-02' },
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
  mockGet.mockResolvedValue({ data: {
    data: MOCK_CONTACTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><TenantContactListPage /></Wrapper>);
}

describe('TenantContactListPage', () => {
  it('renders page title "Inquilinos"', () => {
    renderPage();
    expect(screen.getByText('Tenants')).toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation Status')).toBeInTheDocument();
  });

  it('renders data table with tenant data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });
});
