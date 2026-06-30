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
import { ServiceTypeListPage } from './ServiceTypeListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SERVICE_TYPES = [
  { id: 'st-01', code: 'ROUTINE_IN', name: 'Routine Ingoing', flowType: 'INGOING', requiresRentalTenantConfirmation: true, status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'st-02', code: 'OUTGOING', name: 'Outgoing Inspection', flowType: 'OUTGOING', requiresRentalTenantConfirmation: false, status: 'ACTIVE', createdAt: '2026-03-02T10:00:00Z', updatedAt: '2026-03-02T10:00:00Z' },
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
    data: MOCK_SERVICE_TYPES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><ServiceTypeListPage /></Wrapper>);
}

describe('ServiceTypeListPage', () => {
  it('renders page title "Service Types"', () => {
    renderPage();
    expect(screen.getByText('Service Types')).toBeInTheDocument();
  });

  it('renders "New Service Type" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Service Type');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status filter', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with service type data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('ROUTINE_IN')).toBeInTheDocument();
      expect(screen.getByText('Outgoing Inspection')).toBeInTheDocument();
    });
  });
});
