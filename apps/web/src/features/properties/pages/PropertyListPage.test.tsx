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

vi.mock('@/hooks/useAuth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: vi.fn(() => ({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  })),
}));

import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { PropertyListPage } from './PropertyListPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_PROPERTIES = [
  { id: 'prop-01', propertyCode: 'IMV-001', type: 'HOUSE', street: 'Rua das Flores, 123', suburb: 'Centro', state: 'SP', tenantName: 'Acme Realty' },
  { id: 'prop-02', propertyCode: 'IMV-002', type: 'COMMERCIAL', street: 'Av. Paulista, 1000', suburb: 'Bela Vista', state: 'SP', tenantName: 'Beta Estates' },
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
  mockUseAuth.mockReturnValue({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
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

  it('renders Map View button', () => {
    renderPage();
    expect(screen.getByText('Map View')).toBeInTheDocument();
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

  describe('AM role', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u1', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
        token: 'token',
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });
    });

    it('shows properties immediately without requiring an agency to be selected', async () => {
      renderPage();
      expect(screen.queryByText('Select an agency to view properties.')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('IMV-001')).toBeInTheDocument();
      });
    });

    it('does not disable New Property / Map View actions', () => {
      renderPage();
      expect(screen.getByText('Map View').closest('button')).not.toBeDisabled();
    });

    it('renders an Agency filter', () => {
      renderPage();
      expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    });

    it('renders an Agency column showing each property\'s owning agency', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Acme Realty')).toBeInTheDocument();
        expect(screen.getByText('Beta Estates')).toBeInTheDocument();
      });
    });
  });

  describe('OP role', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u2', name: 'Operator', email: 'op@test.com', role: 'OP', tenantId: null },
        token: 'token',
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });
    });

    it('shows properties immediately without requiring an agency to be selected', async () => {
      renderPage();
      expect(screen.queryByText('Select an agency to view properties.')).not.toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('IMV-001')).toBeInTheDocument();
      });
    });

    it('renders an Agency filter', () => {
      renderPage();
      expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    });

    it('renders an Agency column showing each property\'s owning agency', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Acme Realty')).toBeInTheDocument();
        expect(screen.getByText('Beta Estates')).toBeInTheDocument();
      });
    });
  });

  describe('CL_ADMIN role', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { id: 'u3', name: 'Client', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
        token: 'token',
        isAuthenticated: true,
        isLoading: false,
        login: vi.fn(),
        logout: vi.fn(),
      });
    });

    it('does not render an Agency filter or column', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('IMV-001')).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
      expect(screen.queryByText('Acme Realty')).not.toBeInTheDocument();
    });
  });
});
