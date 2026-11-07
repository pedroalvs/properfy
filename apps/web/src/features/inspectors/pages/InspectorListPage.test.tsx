import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { InspectorListPage } from './InspectorListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INSPECTORS = [
  { id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', status: 'ACTIVE', phone: '11999999999' },
  { id: 'insp-02', name: 'Fernanda Lima', email: 'fernanda@inspecoes.com', status: 'INACTIVE', phone: '11888888888' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SnackbarProvider>{children}</SnackbarProvider>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/inspectors') {
      return Promise.resolve({ data: {
        data: MOCK_INSPECTORS,
        pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
      } });
    }
    // Return empty lists for service-types, service-regions, tenants, etc.
    return Promise.resolve({ data: {
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    } });
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><InspectorListPage /></Wrapper>);
}

describe('InspectorListPage', () => {
  it('renders page title "Inspetores"', () => {
    renderPage();
    expect(screen.getByText('Inspectors')).toBeInTheDocument();
  });

  it('renders "New Inspector" CTA button', () => {
    renderPage();
    const buttons = screen.getAllByText('New Inspector');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with inspector data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
    });
  });

  // #587: assert the actual loading skeleton, not just a static column header.
  // Keep the inspectors GET unresolved so the table stays in its loading branch,
  // which renders LoadingState (role="status" aria-busy). The previous assertion
  // (a "Name" header, always present) passed even if the skeleton never rendered.
  it('shows the loading skeleton while the inspectors query is pending', () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/inspectors') {
        return new Promise(() => {}); // never resolves → stays loading
      }
      return Promise.resolve({
        data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
      });
    });

    renderPage();

    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Carlos Silva')).not.toBeInTheDocument();
  });

  // ── L-F05-14: ?open=<id> deep link ──────────────────────────────────────────
  const OPEN_UUID = '11111111-1111-4111-8111-111111111111';

  let currentSearch = '';
  function LocationProbe() {
    currentSearch = useLocation().search;
    return null;
  }

  function detailResp(id: string, name = 'Deep Linked') {
    return Promise.resolve({
      data: {
        data: {
          id,
          name,
          email: 'd@example.com',
          phone: null,
          status: 'ACTIVE',
          regionIds: [],
          serviceTypesJson: [],
          rating: { average: null, responseCount: 0, doneServicesCount: 0 },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          address: null,
        },
      },
      error: null,
    });
  }

  function renderAt(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    currentSearch = '';
    return render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SnackbarProvider>
              <InspectorListPage />
              <LocationProbe />
            </SnackbarProvider>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }

  it('opens the detail drawer from ?open=<uuid>', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/inspectors') {
        return Promise.resolve({ data: { data: MOCK_INSPECTORS, pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } } });
      }
      if (path === `/v1/inspectors/${OPEN_UUID}`) return detailResp(OPEN_UUID);
      return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
    });
    renderAt(`/inspectors?open=${OPEN_UUID}`);
    // The name shows in the drawer header and the Name row — at least one proves it opened.
    expect((await screen.findAllByText('Deep Linked')).length).toBeGreaterThan(0);
  });

  it('removes ?open from the URL with replace when the drawer is closed', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/inspectors') {
        return Promise.resolve({ data: { data: MOCK_INSPECTORS, pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } } });
      }
      if (path === `/v1/inspectors/${OPEN_UUID}`) return detailResp(OPEN_UUID);
      return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
    });
    renderAt(`/inspectors?open=${OPEN_UUID}`);
    const names = await screen.findAllByText('Deep Linked');
    const dialog = names[0]!.closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(dialog).getByLabelText('Close'));
    await waitFor(() => expect(currentSearch).not.toContain('open'));
  });

  it('shows "This inspector no longer exists." for an unknown ?open uuid (404) without crashing', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/inspectors') {
        return Promise.resolve({ data: { data: MOCK_INSPECTORS, pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } } });
      }
      if (path === `/v1/inspectors/${OPEN_UUID}`) return Promise.reject({ error: { code: 'NOT_FOUND', message: 'gone' } });
      return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
    });
    renderAt(`/inspectors?open=${OPEN_UUID}`);
    expect(await screen.findByText('This inspector no longer exists.')).toBeInTheDocument();
    // The list still renders — the deep link did not crash the page.
    expect(screen.getByText('Carlos Silva')).toBeInTheDocument();
  });

  it('ignores a non-uuid ?open value (no drawer)', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/inspectors') {
        return Promise.resolve({ data: { data: MOCK_INSPECTORS, pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 } } });
      }
      return Promise.resolve({ data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } });
    });
    renderAt('/inspectors?open=abc');
    await screen.findByText('Carlos Silva');
    // No drawer is open — both the detail and form drawers stay closed (aria-modal="false").
    const openDialogs = screen.getAllByRole('dialog').filter((d) => d.getAttribute('aria-modal') === 'true');
    expect(openDialogs).toHaveLength(0);
    expect(screen.queryByText('Deep Linked')).not.toBeInTheDocument();
  });

  it('shows the filter-specific empty state when the "No base address" filter returns nothing', async () => {
    mockGet.mockImplementation(() =>
      Promise.resolve({
        data: { data: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } },
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    render(
      <MemoryRouter
        initialEntries={['/inspectors?missingBaseAddress=true']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SnackbarProvider>
              <InspectorListPage />
            </SnackbarProvider>
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No inspectors without a base address.')).toBeInTheDocument();
    });
  });
});
