import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('OP without a selected tenant lists all contacts cross-tenant (024 §FR-303 — no gate)', async () => {
    // Pre-fix this rendered the FilterRequiredState gate. Under 024
    // Contact is intrinsically cross-tenant: AM/OP open /contacts and
    // see every contact immediately; the Agency selector is a filter,
    // not a gate. The API call goes out without `tenantId`.
    setUser('OP', null);
    renderPage();
    await waitFor(() => {
      const contactListCall = mockGet.mock.calls.find(([path]) => String(path) === '/v1/contacts');
      expect(contactListCall).toBeDefined();
    });
    // No FilterRequiredState; selector remains as an optional filter.
    expect(screen.queryByText(/Select an agency to view contacts/i)).not.toBeInTheDocument();
    const contactListCall = mockGet.mock.calls.find(([path]) => String(path) === '/v1/contacts');
    const params = contactListCall?.[1]?.params?.query ?? {};
    expect(params.tenantId).toBeUndefined();
  });

  it('AM without a selected tenant lists all contacts cross-tenant (no gate)', async () => {
    setUser('AM', null);
    renderPage();
    await waitFor(() => {
      expect(mockGet.mock.calls.find(([path]) => String(path) === '/v1/contacts')).toBeDefined();
    });
    expect(screen.queryByText(/Select an agency to view contacts/i)).not.toBeInTheDocument();
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

describe('ContactListPage — row open-detail link', () => {
  it('Open detail is a same-tab link to the contact detail page', async () => {
    setUser('CL_ADMIN', TENANT_A);
    mockGet.mockResolvedValue({
      data: {
        data: [{
          id: 'contact-1',
          displayName: 'Jane Owner',
          type: 'OWNER',
          primaryEmail: 'jane@example.com',
          primaryPhone: null,
          propertyCount: 0,
          isActive: true,
        }],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      },
    });
    renderPage();
    const link = await screen.findByLabelText('Open detail');
    expect(link).toHaveAttribute('href', '/contacts/contact-1');
    expect(link).not.toHaveAttribute('target');
  });
});

describe('ContactListPage — Standalone sentinel option (024 §FR-308)', () => {
  function mockTenantsResponse(tenants: Array<{ id: string; name: string }>) {
    mockGet.mockImplementation(async (path: string) => {
      if (path === '/v1/tenants') {
        return {
          data: {
            data: tenants,
            pagination: { page: 1, pageSize: 100, total: tenants.length, totalPages: 1 },
          },
        };
      }
      return { data: EMPTY_LIST };
    });
  }

  async function openAgencyDropdown() {
    const trigger = await screen.findByLabelText('Agency');
    fireEvent.click(trigger);
  }

  it('AM Agency dropdown exposes the "Standalone — no agency" option', async () => {
    setUser('AM', null);
    mockTenantsResponse([{ id: TENANT_A, name: 'Acme Realty' }]);

    renderPage();
    await openAgencyDropdown();

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Standalone — no agency/i }),
      ).toBeInTheDocument();
    });
  });

  it('OP Agency dropdown also exposes the Standalone option', async () => {
    setUser('OP', null);
    mockTenantsResponse([{ id: TENANT_A, name: 'Acme Realty' }]);

    renderPage();
    await openAgencyDropdown();

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Standalone — no agency/i }),
      ).toBeInTheDocument();
    });
  });

  it('CL_ADMIN does NOT see the Agency selector at all (Standalone option unreachable)', () => {
    setUser('CL_ADMIN', TENANT_A);
    renderPage();
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });
});
