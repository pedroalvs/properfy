import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Shallow mock — property-form internals are covered by PropertyFormDrawer.test.tsx.
vi.mock('@/features/properties/components/PropertyFormDrawer', () => ({
  PropertyFormDrawer: ({
    open,
    onClose,
    onCreated,
    onSaved,
    tenantIdOverride,
    initialBranchId,
    lockBranch,
  }: {
    open: boolean;
    onClose: () => void;
    onCreated?: (id: string) => void;
    onSaved: () => void;
    tenantIdOverride?: string;
    initialBranchId?: string;
    lockBranch?: boolean;
  }) =>
    open ? (
      <div
        data-testid="property-form-drawer"
        data-tenant={tenantIdOverride ?? ''}
        data-branch={initialBranchId ?? ''}
        data-locked={String(!!lockBranch)}
      >
        <button
          onClick={() => {
            onCreated?.('prop-new');
            onSaved();
          }}
        >
          simulate-create
        </button>
        <button onClick={onClose}>simulate-close</button>
      </div>
    ) : null,
}));

import { api } from '@/services/api';
import { AppointmentCreatePage } from './AppointmentCreatePage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

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
        <SnackbarProvider>
          <MemoryRouter initialEntries={['/appointments/new']}>
            {children}
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({
    data: { data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <AppointmentCreatePage />
    </Wrapper>,
  );
}

describe('AppointmentCreatePage', () => {
  it('renders page title "New Appointment"', () => {
    renderPage();
    expect(screen.getByText('New Appointment')).toBeInTheDocument();
  });

  it('renders back button', () => {
    renderPage();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('renders form sections', () => {
    renderPage();
    expect(screen.getByText('Appointment Details')).toBeInTheDocument();
    expect(screen.getByText('Tenant Contact')).toBeInTheDocument();
    expect(screen.getByText('Access & Key')).toBeInTheDocument();
    expect(screen.getByText('Restrictions')).toBeInTheDocument();
    expect(screen.getAllByText('Notes').length).toBeGreaterThanOrEqual(1);
  });

  it('renders required form fields', () => {
    renderPage();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    expect(screen.getByLabelText('Property')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
    expect(screen.getByLabelText('Tenant Name')).toBeInTheDocument();
  });

  it('renders Create Appointment button', () => {
    renderPage();
    expect(screen.getByText('Create Appointment')).toBeInTheDocument();
  });

  it('renders contextual property creation action', () => {
    renderPage();
    expect(screen.getByText('Property not listed? Create one')).toBeInTheDocument();
  });

  it('renders Cancel button', () => {
    renderPage();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows validation errors when submitting empty form', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Create Appointment'));
    await waitFor(() => {
      const requiredErrors = screen.getAllByText('Required field');
      expect(requiredErrors.length).toBeGreaterThan(0);
    });
  });

  it('opens the inline property drawer pre-filled with the selected agency and locked branch', async () => {
    mockGet.mockImplementation((path: string) => {
      const list = (items: Array<Record<string, unknown>>) => Promise.resolve({
        data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: items.length ? 1 : 0 } },
      });
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }]);
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      return list([]);
    });

    renderPage();

    // Select agency, then branch — the button is disabled until both are chosen.
    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));

    fireEvent.click(screen.getByText('Property not listed? Create one'));

    const drawer = screen.getByTestId('property-form-drawer');
    expect(drawer).toHaveAttribute('data-tenant', 'tenant-1');
    expect(drawer).toHaveAttribute('data-branch', 'branch-9');
    expect(drawer).toHaveAttribute('data-locked', 'true');
  });

  it('auto-selects the created property and closes the drawer on create success', async () => {
    let created = false;
    mockGet.mockImplementation((path: string) => {
      const list = (items: Array<Record<string, unknown>>) => Promise.resolve({
        data: { data: items, pagination: { page: 1, pageSize: 100, total: items.length, totalPages: items.length ? 1 : 0 } },
      });
      if (path === '/v1/tenants') return list([{ id: 'tenant-1', name: 'Agency One' }]);
      if (path === '/v1/branches') return list([{ id: 'branch-9', name: 'Branch Nine' }]);
      if (path === '/v1/properties') {
        return list(created
          ? [{ id: 'prop-new', street: 'New St', propertyCode: 'AG-PROP-0009' }]
          : []);
      }
      return list([]);
    });

    renderPage();

    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(await screen.findByText('Agency One'));
    fireEvent.click(screen.getByLabelText('Branch'));
    fireEvent.click(await screen.findByText('Branch Nine'));

    // Let the initial (empty) property-options fetch settle before creating —
    // an in-flight fetch would dedupe the invalidation-triggered refetch.
    await waitFor(() => {
      expect(mockGet.mock.calls.filter(([p]) => p === '/v1/properties').length).toBe(1);
    });

    fireEvent.click(screen.getByText('Property not listed? Create one'));
    created = true;
    fireEvent.click(screen.getByText('simulate-create'));

    await waitFor(() => {
      expect(screen.queryByTestId('property-form-drawer')).not.toBeInTheDocument();
    });
    // The refetched options list now contains the created property, and the
    // form holds its id, so the select renders its label.
    await waitFor(() => {
      expect(screen.getByText('AG-PROP-0009 - New St')).toBeInTheDocument();
    });
  });
});
