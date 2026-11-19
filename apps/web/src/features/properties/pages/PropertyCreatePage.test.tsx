import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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

const AM_USER = { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' };
const authState = vi.hoisted(() => ({
  user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' } as {
    id: string; name: string; email: string; role: string; tenantId: string;
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { api } from '@/services/api';
import { PropertyCreatePage } from './PropertyCreatePage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function createWrapper(route: string = '/properties/new') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[route]}>
            {children}
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  authState.user = { ...AM_USER };
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
  });
  (api.POST as ReturnType<typeof vi.fn>).mockReset?.();
});

function renderPage(route?: string) {
  const Wrapper = createWrapper(route);
  return render(
    <Wrapper>
      <PropertyCreatePage />
    </Wrapper>,
  );
}

const paginated = (items: Array<Record<string, unknown>>) => ({
  data: {
    data: items,
    pagination: { page: 1, pageSize: 100, total: items.length, totalPages: items.length ? 1 : 0 },
  },
});

/** Path-aware GET mock: returns the given tenants/branches, empty for everything else. */
function mockListEndpoints(opts: {
  tenants?: Array<Record<string, unknown>>;
  branches?: Array<Record<string, unknown>>;
} = {}) {
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/tenants') return Promise.resolve(paginated(opts.tenants ?? []));
    if (path === '/v1/branches') return Promise.resolve(paginated(opts.branches ?? []));
    return Promise.resolve(paginated([]));
  });
}

describe('PropertyCreatePage', () => {
  it('renders page title "New Property"', () => {
    renderPage();
    expect(screen.getByText('New Property')).toBeInTheDocument();
  });

  it('renders exactly one header Back button', () => {
    renderPage();
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
  });

  it('renders form sections', () => {
    renderPage();
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getAllByText('Notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders required form fields', () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.queryByLabelText('Property Code')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Verified Address')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Street')).toBeInTheDocument();
    expect(screen.getByLabelText('Suburb')).toBeInTheDocument();
    expect(screen.getByLabelText('Postcode')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
  });

  it('shows the Apartment field only when type is APARTMENT', () => {
    renderPage();
    expect(screen.queryByLabelText('Apartment')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Type'));
    fireEvent.click(screen.getByText('Apartment'));
    expect(screen.getByLabelText('Apartment')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Type'));
    fireEvent.click(screen.getByText('House'));
    expect(screen.queryByLabelText('Apartment')).not.toBeInTheDocument();
  });

  it('renders Create Property button', () => {
    renderPage();
    expect(screen.getByText('Create Property')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    renderPage();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Create Property'));
    await waitFor(() => {
      const requiredErrors = screen.getAllByText('Required field');
      expect(requiredErrors.length).toBeGreaterThan(0);
    });
  });

  it('has centered form container', () => {
    const { container } = renderPage();
    const centeredDiv = container.querySelector('.mx-auto.max-w-\\[640px\\]');
    expect(centeredDiv).toBeInTheDocument();
  });

  it('keeps structured address fields editable for manual refinement', () => {
    renderPage();
    expect(screen.getByLabelText('Street')).not.toBeDisabled();
    expect(screen.getByLabelText('Suburb')).not.toBeDisabled();
    expect(screen.getByLabelText('Postcode')).not.toBeDisabled();
  });

  it('pre-fills agency and branch from URL query params', async () => {
    mockListEndpoints({
      tenants: [{ id: 'tenant-1', name: 'Agency One' }],
      branches: [{ id: 'branch-9', name: 'Branch Nine' }],
    });

    renderPage('/properties/new?tenantId=tenant-1&branchId=branch-9');

    await waitFor(() => {
      expect(screen.getByText('Agency One')).toBeInTheDocument();
      expect(screen.getByText('Branch Nine')).toBeInTheDocument();
    });
  });

  it('submits the pre-filled branch even when branch options have not loaded', async () => {
    // All list endpoints empty (default mock): the Branch select can never resolve a label,
    // but the value from the URL must still flow through to the create payload.
    // branchId/tenantId are validated as UUIDs by createPropertySchema, so use real UUIDs.
    const TENANT_ID = '22222222-2222-2222-2222-222222222222';
    const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
    const mockPost = api.POST as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValue({ data: { data: { id: 'new-prop-1' } } });

    renderPage(`/properties/new?tenantId=${TENANT_ID}&branchId=${BRANCH_ID}`);

    fireEvent.click(screen.getByLabelText('Type'));
    fireEvent.click(screen.getByText('House'));
    fireEvent.change(screen.getByLabelText('Street'), { target: { value: '1 Test St' } });
    fireEvent.change(screen.getByLabelText('Suburb'), { target: { value: 'Sydney' } });
    fireEvent.change(screen.getByLabelText('Postcode'), { target: { value: '2000' } });
    fireEvent.click(screen.getByLabelText('State'));
    fireEvent.click(screen.getByText('New South Wales'));

    fireEvent.click(screen.getByText('Create Property'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/properties',
        expect.objectContaining({
          body: expect.objectContaining({ branchId: BRANCH_ID, tenantId: TENANT_ID }),
        }),
      );
    });
  });

  it('keeps the pre-filled branch under React StrictMode (no reset-effect regression)', async () => {
    mockListEndpoints({
      tenants: [{ id: 'tenant-1', name: 'Agency One' }],
      branches: [{ id: 'branch-9', name: 'Branch Nine' }],
    });
    const Wrapper = createWrapper('/properties/new?tenantId=tenant-1&branchId=branch-9');

    render(
      <StrictMode>
        <Wrapper>
          <PropertyCreatePage />
        </Wrapper>
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText('Branch Nine')).toBeInTheDocument();
    });
  });

  it('does not prompt to discard changes when only pre-filled from query params', async () => {
    mockListEndpoints({
      tenants: [{ id: 'tenant-1', name: 'Agency One' }],
      branches: [{ id: 'branch-9', name: 'Branch Nine' }],
    });
    renderPage('/properties/new?tenantId=tenant-1&branchId=branch-9');
    await waitFor(() => expect(screen.getByText('Branch Nine')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('pre-fills branch for client roles without an agency selector (tenant from JWT)', async () => {
    authState.user = { id: 'usr-cl', name: 'Client', email: 'c@c.com', role: 'CL_ADMIN', tenantId: 'tenant-cl' };
    mockListEndpoints({ branches: [{ id: 'branch-7', name: 'Branch Seven' }] });

    renderPage('/properties/new?branchId=branch-7');

    await waitFor(() => expect(screen.getByText('Branch Seven')).toBeInTheDocument());
    expect(screen.queryByLabelText('Agency')).not.toBeInTheDocument();
  });

  it('still pre-fills agency from router location.state (same-tab navigation)', async () => {
    mockListEndpoints({ tenants: [{ id: 'tenant-1', name: 'Agency One' }] });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[{ pathname: '/properties/new', state: { tenantId: 'tenant-1' } }]}>
            <PropertyCreatePage />
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText('Agency One')).toBeInTheDocument());
  });
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{`${loc.pathname}${loc.search}`}</div>;
}

function PropertiesStub() {
  const navigate = useNavigate();
  return (
    <div>
      <span>properties list</span>
      <button type="button" onClick={() => navigate('/properties/new')}>
        open create
      </button>
    </div>
  );
}

function renderWithRoutes(initialEntries: string[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={initialEntries}>
          <Routes>
            <Route path="/properties" element={<PropertiesStub />} />
            <Route path="/properties/new" element={<><PropertyCreatePage /><LocationProbe /></>} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('PropertyCreatePage — Back navigation (X01)', () => {
  // P-b — direct entry with a clean form → Back → fallback /properties.
  it('navigates to /properties on a direct entry with a clean form', async () => {
    const user = userEvent.setup();
    renderWithRoutes(['/properties/new']);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('properties list')).toBeInTheDocument();
  });

  // P-c — in-app history → Back returns to the previous screen.
  it('returns to the previous screen when history exists', async () => {
    const user = userEvent.setup();
    renderWithRoutes(['/properties']);
    await user.click(screen.getByRole('button', { name: 'open create' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('properties list')).toBeInTheDocument();
  });

  // Dirty form → Back opens the discard dialog and does not navigate; Discard then navigates.
  it('opens the discard dialog on a dirty form and navigates only on Discard', async () => {
    const user = userEvent.setup();
    renderWithRoutes(['/properties/new']);
    await user.type(screen.getAllByRole('textbox')[0]!, 'Dirty');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Discard changes?')).toBeInTheDocument();
    expect(screen.getByTestId('loc')).toHaveTextContent('/properties/new');
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByText('properties list')).toBeInTheDocument();
  });
});
