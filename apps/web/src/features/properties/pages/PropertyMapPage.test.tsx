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
import { PropertyMapPage } from './PropertyMapPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_PROPERTIES = [
  {
    id: 'prop-1',
    street: '123 Main St',
    suburb: 'Bondi',
    state: 'NSW',
    postcode: '2026',
    type: 'RESIDENTIAL',
    latitude: -33.89,
    longitude: 151.27,
    branchName: 'Central',
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
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
  mockGet.mockResolvedValue({
    data: {
      data: MOCK_PROPERTIES,
      pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
    },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <PropertyMapPage />
    </Wrapper>,
  );
}

describe('PropertyMapPage', () => {
  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('Property Map')).toBeInTheDocument();
  });

  it('renders List View button', () => {
    renderPage();
    expect(screen.getByText('List View')).toBeInTheDocument();
  });

  it('renders map container', () => {
    renderPage();
    expect(screen.getByTestId('map-container')).toBeInTheDocument();
  });

  it('renders property list in side panel', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('123 Main St')).toBeInTheDocument();
    });
  });

  it('renders type filter', () => {
    renderPage();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
  });

  it('renders search filter', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
  });
});
