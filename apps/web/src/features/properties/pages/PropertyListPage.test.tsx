import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
import { PropertyListPage } from './PropertyListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_PROPERTIES = [
  { id: 'prop-01', propertyCode: 'IMV-001', type: 'RESIDENTIAL', street: 'Rua das Flores, 123', suburb: 'Centro', state: 'SP' },
  { id: 'prop-02', propertyCode: 'IMV-002', type: 'COMMERCIAL', street: 'Av. Paulista, 1000', suburb: 'Bela Vista', state: 'SP' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_PROPERTIES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><PropertyListPage /></Wrapper>);
}

describe('PropertyListPage', () => {
  it('renders page title "Imóveis"', () => {
    renderPage();
    expect(screen.getByText('Properties')).toBeInTheDocument();
  });

  it('renders "New Property" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Property');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and type controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    const typeElements = screen.getAllByLabelText('Type');
    expect(typeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders data table with property data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('IMV-001')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
});
