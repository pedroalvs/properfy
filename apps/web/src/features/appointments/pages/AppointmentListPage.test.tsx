import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { AppointmentListPage } from './AppointmentListPage';

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_APPOINTMENTS = [
  {
    // `branchId` matters: the AM/OP branch fallback keys its option map on it,
    // so fixtures missing it collapse every row onto one `undefined` entry.
    id: 'apt-01', code: 'VST-001', status: 'SCHEDULED', branchId: 'br-1', branchName: 'Filial Centro',
    address: 'Rua das Flores, 123', contactName: 'João', scheduledDate: '2026-04-01',
    timeSlotStart: '09:00', timeSlotEnd: '12:00', rentalTenantConfirmationStatus: 'PENDING',
  },
  {
    id: 'apt-02', code: 'VST-002', status: 'DONE', branchId: 'br-2', branchName: 'Filial Norte',
    address: 'Av. Paulista, 1000', contactName: 'Maria', scheduledDate: '2026-04-02',
    timeSlotStart: '14:00', timeSlotEnd: '17:00', rentalTenantConfirmationStatus: 'CONFIRMED',
  },
];

/** Surfaces the current query string so tests can assert param clean-up. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function createWrapper(initialEntries: string[] = ['/appointments']) {
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
            <MemoryRouter initialEntries={initialEntries}>
              {children}
              <LocationProbe />
            </MemoryRouter>
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_APPOINTMENTS,
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

function renderPage(initialEntries?: string[]) {
  const Wrapper = createWrapper(initialEntries);
  return render(
    <Wrapper>
      <AppointmentListPage />
    </Wrapper>,
  );
}

/**
 * `DrawerPanel` keeps its markup mounted while closed (it slides off-screen and
 * jsdom can't see transforms), so "is the create drawer open?" is read from the
 * a11y contract — `aria-modal` tracks `open`.
 */
function isCreateDrawerOpen(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'))
    .some((el) => (el.textContent ?? '').includes('Create Appointment'));
}

function signInAs(role: string) {
  mockUseAuth.mockReturnValue({
    user: { id: 'u1', name: 'User', email: 'user@test.com', role, tenantId: 't-1' },
    token: 'token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe('AppointmentListPage', () => {
  it('renders page title "Vistorias"', () => {
    renderPage();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('renders "New Appointment" CTA button', () => {
    renderPage();
    expect(screen.getAllByText('New Appointment').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Map View button for AM role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Map View')).toBeInTheDocument();
  });

  it('shows Map View button for CL_ADMIN role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u2', name: 'Client', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Map View')).toBeInTheDocument();
  });

  it('shows Import button for AM role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  // Regression test: the Import button was gated on the `property.import`
  // action instead of `appointment.import`, so a CL_ADMIN reaching the
  // /appointments/import route had no visible entry point.
  it('shows Import button for CL_ADMIN role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u2', name: 'Client', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Import')).toBeInTheDocument();
  });

  it('hides Import button for CL_USER role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u3', name: 'Client User', email: 'clu@test.com', role: 'CL_USER', tenantId: 'tenant-1' },
      token: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText('Import')).not.toBeInTheDocument();
  });

  it('renders filter bar with search and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with appointment data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('VST-001')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Code')).toBeInTheDocument();
  });

  describe('additional columns switch', () => {
    it('hides the extra columns until the switch is turned on', async () => {
      const user = userEvent.setup();
      renderPage();

      expect(screen.queryByText('Property Code')).not.toBeInTheDocument();

      await user.click(screen.getByRole('switch', { name: 'Show additional columns' }));

      expect(screen.getByText('Property Code')).toBeInTheDocument();
      expect(screen.getByText('Cancellation Reason')).toBeInTheDocument();
      // "Service Type" is also a filter-bar label, so scope to the table header.
      const tableHeader = document.querySelector('table thead') as HTMLElement;
      expect(within(tableHeader).getByText('Service Type')).toBeInTheDocument();
    });
  });

  describe('Generate Excel', () => {
    it('renders the export action', () => {
      renderPage();
      // PageHeader can render a duplicate CTA for the mobile layout.
      expect(screen.getAllByText('Generate Excel').length).toBeGreaterThanOrEqual(1);
    });

    it('exports the CURRENT filter set, not the visible page', async () => {
      const user = userEvent.setup();
      renderPage(['/appointments?suburb=Bondi&confirmationStatus=not_sent']);

      mockGet.mockResolvedValue({
        data: { data: { filename: 'a.xlsx', contentType: 'application/xlsx', contentBase64: '' } },
      });

      await user.click(screen.getAllByText('Generate Excel')[0]!);

      await waitFor(() => {
        expect(mockGet).toHaveBeenCalledWith('/v1/appointments/export', expect.anything());
      });
      const exportCall = mockGet.mock.calls.find((c) => c[0] === '/v1/appointments/export');
      const query = exportCall?.[1]?.params?.query as Record<string, unknown>;
      expect(query).toMatchObject({ suburb: 'Bondi', confirmationStatus: 'not_sent' });
      expect(query.page).toBeUndefined();
    });
  });

  // `/appointments/new` redirects here with `?new=1` instead of rendering a
  // second, drifting copy of the create form.
  describe('?new=1 deep link', () => {
    it('opens the create drawer and drops the param so a refresh does not reopen it', async () => {
      signInAs('AM');
      renderPage(['/appointments?new=1']);

      await waitFor(() => {
        expect(isCreateDrawerOpen()).toBe(true);
      });
      expect(screen.getByTestId('location-search')).toHaveTextContent('');
    });

    it('does not open the create drawer for a role without appointment.create', () => {
      signInAs('INSP');
      renderPage(['/appointments?new=1']);

      expect(isCreateDrawerOpen()).toBe(false);
    });

    it('keeps the drawer closed without the param', () => {
      signInAs('AM');
      renderPage();

      expect(isCreateDrawerOpen()).toBe(false);
    });
  });

  describe('agency and inspector scoping', () => {
    /**
     * The default mock answers every path with the appointments payload, which
     * would make the option lists look populated no matter what. These tests
     * turn on which endpoint was asked, so a query that must stay disabled for a
     * role is provably not fired.
     */
    function mockByPath() {
      mockGet.mockReset();
      mockGet.mockImplementation((path: string) => {
        if (path === '/v1/tenants') {
          return Promise.resolve({ data: {
            data: [{ id: 'tenant-1', name: 'Acme Realty' }],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          } });
        }
        if (path === '/v1/inspectors') {
          return Promise.resolve({ data: {
            data: [{ id: 'insp-1', name: 'Carlos Inspector' }],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          } });
        }
        if (path === '/v1/branches') {
          return Promise.resolve({ data: {
            data: [{ id: 'branch-1', name: 'Downtown Branch' }],
            pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
          } });
        }
        return Promise.resolve({ data: {
          data: MOCK_APPOINTMENTS,
          pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
        } });
      });
    }

    const calledPaths = () => mockGet.mock.calls.map((call) => call[0]);

    /**
     * The always-mounted create drawer has its own `aria-label="Agency"` and
     * `"Branch"` controls, so page-wide queries are ambiguous. FilterBar
     * publishes `role="search"`/`aria-label="Filters"` — scope to that.
     */
    const filterBar = () => within(screen.getByRole('search', { name: 'Filters' }));

    /**
     * `/v1/branches` is also hit by the always-mounted create drawer, so the
     * path alone proves nothing. The filter's cascade is the only caller that
     * scopes the request to a chosen agency.
     */
    const branchCallsScopedTo = (tenantId: string) =>
      mockGet.mock.calls.filter(
        (call) => call[0] === '/v1/branches' && call[1]?.params?.query?.tenantId === tenantId,
      );

    /** Any tenant-scoped branch request, whichever agency it names. */
    const allScopedBranchCalls = () =>
      mockGet.mock.calls.filter(
        (call) => call[0] === '/v1/branches' && !!call[1]?.params?.query?.tenantId,
      );

    it('shows the Agency column and select for AM', async () => {
      mockByPath();
      signInAs('AM');
      renderPage();

      // Each select appears when its own query resolves, so they are awaited
      // separately rather than assumed to land in the same tick.
      await waitFor(() => expect(filterBar().getByLabelText('Agency')).toBeInTheDocument());
      expect(filterBar().getByLabelText('Inspector')).toBeInTheDocument();
      // An unselected FilterSelect renders its label as the button text too, so
      // the column assertion has to be role-scoped to stay unambiguous.
      expect(screen.getByRole('columnheader', { name: 'Agency' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Branch' })).toBeInTheDocument();
    });

    it('hides the Agency column and select for CL_ADMIN, keeping Branch and Inspector', async () => {
      mockByPath();
      signInAs('CL_ADMIN');
      renderPage();

      await waitFor(() => expect(filterBar().getByLabelText('Inspector')).toBeInTheDocument());
      expect(filterBar().queryByLabelText('Agency')).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Agency' })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Branch' })).toBeInTheDocument();
      // /v1/tenants is AM/OP-only on the backend — the query must be disabled,
      // not merely hidden, or every client user's list fires a 403.
      expect(calledPaths()).not.toContain('/v1/tenants');
    });

    it('loads the selected agency branches instead of deriving them from the rows', async () => {
      mockByPath();
      signInAs('AM');
      renderPage(['/appointments?tenantId=tenant-1']);

      await waitFor(() => {
        expect(branchCallsScopedTo('tenant-1')).not.toHaveLength(0);
      });

      // Firing the request proves nothing on its own — the hook could still be
      // returning the row-derived list. The fixtures are deliberately
      // discriminating: `Downtown Branch` only ever comes from /v1/branches,
      // `Filial Centro` only from the loaded appointment rows.
      await userEvent.click(filterBar().getByLabelText('Branch'));
      const listbox = filterBar().getByRole('listbox', { name: 'Branch' });
      expect(within(listbox).getByText('Downtown Branch')).toBeInTheDocument();
      expect(within(listbox).queryByText('Filial Centro')).not.toBeInTheDocument();
    });

    it('offers the branches of the loaded rows when no agency is picked', async () => {
      mockByPath();
      signInAs('AM');
      renderPage();

      await waitFor(() => expect(filterBar().getByLabelText('Branch')).toBeInTheDocument());
      await userEvent.click(filterBar().getByLabelText('Branch'));
      const listbox = filterBar().getByRole('listbox', { name: 'Branch' });
      // The fallback actually populates — not merely "no request was made".
      expect(within(listbox).getByText('Filial Centro')).toBeInTheDocument();
      expect(within(listbox).getByText('Filial Norte')).toBeInTheDocument();
    });

    it('shows the Agency column and select for OP too', async () => {
      mockByPath();
      signInAs('OP');
      renderPage();

      await waitFor(() => expect(filterBar().getByLabelText('Agency')).toBeInTheDocument());
      expect(screen.getByRole('columnheader', { name: 'Agency' })).toBeInTheDocument();
    });

    // Regression guard for the CL leg of `effectiveTenantId`: swapping the
    // ternary arms would silently drop client users to row-derived branches.
    it('scopes branches to the JWT tenant for CL_ADMIN', async () => {
      mockByPath();
      signInAs('CL_ADMIN');
      renderPage();

      await waitFor(() => {
        expect(branchCallsScopedTo('t-1')).not.toHaveLength(0);
      });
    });

    it('ignores a deep-linked agency for CL_ADMIN and stays on the JWT tenant', async () => {
      mockByPath();
      signInAs('CL_ADMIN');
      renderPage(['/appointments?tenantId=tenant-1']);

      await waitFor(() => {
        expect(branchCallsScopedTo('t-1')).not.toHaveLength(0);
      });
      expect(branchCallsScopedTo('tenant-1')).toHaveLength(0);
    });

    it('does not query branches for AM before an agency is picked', async () => {
      mockByPath();
      signInAs('AM');
      renderPage();

      await waitFor(() => {
        expect(calledPaths()).toContain('/v1/appointments');
      });
      // Cross-tenant branch listing is not something the API can answer, so the
      // options fall back to the branches present on the loaded rows. Assert on
      // *any* scoped call, not just the JWT tenant: the drawer's own unscoped
      // request is the only /v1/branches traffic allowed here.
      expect(allScopedBranchCalls()).toHaveLength(0);
      expect(branchCallsScopedTo('t-1')).toHaveLength(0);
    });
  });
});
