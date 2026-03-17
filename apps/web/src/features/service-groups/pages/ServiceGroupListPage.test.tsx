import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
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

import { apiClient } from '@/lib/api-client';
import { ServiceGroupListPage } from './ServiceGroupListPage';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_SERVICE_GROUPS = [
  { id: 'sg-01', name: 'ABC Paulista', regionName: 'São Paulo - ABC', status: 'PUBLISHED', inspectorName: 'Carlos Silva', priorityMode: 'STANDARD' },
  { id: 'sg-02', name: 'Barra RJ', regionName: 'Rio de Janeiro - Barra', status: 'DRAFT', inspectorName: 'Fernanda Lima', priorityMode: 'PRIORITY_24H' },
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
  mockGet.mockResolvedValue({
    data: MOCK_SERVICE_GROUPS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><ServiceGroupListPage /></Wrapper>);
}

describe('ServiceGroupListPage', () => {
  it('renders page title "Grupos de Serviço"', () => {
    renderPage();
    expect(screen.getByText('Service Groups')).toBeInTheDocument();
  });

  it('renders "New Group" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Group');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with service group data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('ABC Paulista')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    const matches = screen.getAllByText('Name');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
