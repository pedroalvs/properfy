import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
import { TenantDetailPage } from './TenantDetailPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_TENANT = {
  id: 'ten-01',
  name: 'Imob Alpha',
  legalName: 'Alpha LTDA',
  status: 'ACTIVE',
  branchCount: 3,
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  settings: {},
  notes: 'Some notes',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

const MOCK_BRANCHES = {
  data: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter initialEntries={['/tenants/ten-01']}>
              <Routes>
                <Route path="/tenants/:id" element={children} />
              </Routes>
            </MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path.includes('/branches')) {
      return Promise.resolve({ data: MOCK_BRANCHES });
    }
    return Promise.resolve({ data: { data: MOCK_TENANT } });
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><TenantDetailPage /></Wrapper>);
}

describe('TenantDetailPage', () => {
  it('renders tenant name as page header', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Imob Alpha').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders tenant status chip', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Overview and Branches tabs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Branches' })).toBeInTheDocument();
  });

  it('renders tenant detail rows in overview tab', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Timezone').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('America/Sao_Paulo').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BRL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Some notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Edit button', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows empty state when tenant is not found', async () => {
    mockGet.mockResolvedValueOnce({ data: undefined, error: { message: 'Not found' } });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Agency not found')).toBeInTheDocument();
    });
  });
});
