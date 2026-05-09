import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

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

import type * as UseAuthModule from '@/hooks/useAuth';
type UseAuthExports = typeof UseAuthModule;
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', async (importOriginal) => {
  const actual = await importOriginal<UseAuthExports>();
  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

import { SnackbarProvider } from '@/hooks/useSnackbar';
import { api } from '@/services/api';
import { ContactListPage } from './ContactListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001';

const EMPTY_LIST = {
  data: [],
  pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
};

function setUser(role: string, tenantId: string | null) {
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u1',
      name: 'Test',
      email: 't@t.com',
      role,
      tenantId,
      branchId: null,
    },
    token: 'tok',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter>{children}</MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: EMPTY_LIST });
  mockUseAuth.mockReset();
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><ContactListPage /></Wrapper>);
}

describe('ContactListPage — Agency selector visibility (Constitution v1.3.0 — op_role_rollback)', () => {
  it('renders the Agency selector for AM', async () => {
    setUser('AM', null);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Agency')).toBeInTheDocument());
  });

  it('renders the Agency selector for OP (cross-tenant operational role)', async () => {
    setUser('OP', null);
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Agency')).toBeInTheDocument());
  });

  it('does NOT render the Agency selector for CL_ADMIN', () => {
    setUser('CL_ADMIN', TENANT_A);
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });

  it('does NOT render the Agency selector for CL_USER', () => {
    setUser('CL_USER', TENANT_A);
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });

  it('OP without a selected tenant sees the FilterRequiredState (no table)', async () => {
    setUser('OP', null);
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Select an agency to view contacts/i)).toBeInTheDocument(),
    );
  });

  it('CL_ADMIN loads the list immediately from the JWT tenant (no agency gate)', async () => {
    setUser('CL_ADMIN', TENANT_A);
    renderPage();
    await waitFor(() => {
      const contactListCall = mockGet.mock.calls.find(([path]) => String(path) === '/v1/contacts');
      expect(contactListCall).toBeDefined();
    });
  });
});
