import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => mockNavigate };
});
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

// Mutable role — default null so isGlobalRole=false, page shows content directly
// (matches original test baseline; route guard prevents unauthenticated access in production)
let mockUserRole: string | null = null;
let mockTenantId: string | null = null;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUserRole
      ? { id: 'usr-1', name: 'Test Admin', email: 'admin@test.com', role: mockUserRole, tenantId: mockTenantId }
      : null,
    isAuthenticated: mockUserRole !== null,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: mockUserRole ? 'token' : null,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { api } from '@/services/api';
import { FinancialEntriesPage } from './FinancialEntriesPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRIES = [
  { id: 'fin-01', entryType: 'TENANT_DEBIT', appointmentCode: 'VIST-001', description: 'Debit', amount: 350, currency: 'USD', status: 'PENDING', effectiveAt: '2026-03-15', relatedEntityName: 'Imob Centro' },
  { id: 'fin-02', entryType: 'INSPECTOR_PAYOUT', appointmentCode: 'VIST-002', description: 'Payout', amount: 180, currency: 'USD', status: 'APPROVED', effectiveAt: '2026-03-16', relatedEntityName: 'Diego' },
];

const MOCK_SUMMARY = {
  totalDebits: 5000,
  totalPayouts: 3000,
  totalAdjustments: 200,
  totalRefunds: 150,
  pendingCount: 7,
  currency: 'USD',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SnackbarProvider>{children}</SnackbarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  // Default: null user — isGlobalRole=false, page shows content directly
  mockUserRole = null;
  mockTenantId = null;
  mockGet.mockReset();
  mockGet.mockImplementation((path: string) => {
    if (path === '/v1/financial/entries/summary') {
      return Promise.resolve({ data: { data: MOCK_SUMMARY } });
    }
    return Promise.resolve({
      data: {
        data: MOCK_ENTRIES,
        pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
      },
    });
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><FinancialEntriesPage /></Wrapper>);
}

describe('FinancialEntriesPage', () => {
  it('renders page title "Financial Entries"', () => {
    renderPage();
    expect(screen.getByText('Financial Entries')).toBeInTheDocument();
  });

  it('does not render legacy "New Entry" CTA', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'New Entry' })).not.toBeInTheDocument();
  });

  it('renders summary bar', () => {
    renderPage();
    expect(screen.getByTestId('financial-summary-bar')).toBeInTheDocument();
  });

  it('renders Adjustment and Refund secondary actions', () => {
    renderPage();
    expect(screen.getByText('Adjustment')).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
  });

  it('renders an Invoices action that navigates to the invoices page', () => {
    renderPage();
    const button = screen.getByText('Invoices');
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/financial/invoices');
  });

  it('renders filter bar with type and status controls', () => {
    renderPage();
    const filterBar = screen.getByRole('search', { name: 'Filters' });
    expect(within(filterBar).getByLabelText('Type')).toBeInTheDocument();
    expect(within(filterBar).getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with financial data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('VIST-001').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders selection checkboxes in the table when data loaded', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('VIST-001').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByLabelText('Select all pending entries')).toBeInTheDocument();
  });

  it('shows NoPermissionState for roles without financial access (CL_USER)', () => {
    mockUserRole = 'CL_USER';
    mockTenantId = 'tenant-1';
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view financial entries.")).toBeInTheDocument();
  });

  it('shows NoPermissionState for roles without financial access (CL_ADMIN)', () => {
    mockUserRole = 'CL_ADMIN';
    mockTenantId = 'tenant-1';
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText("You don't have permission to view financial entries.")).toBeInTheDocument();
  });

  it('allows AM to reach the page (shows tenant selection prompt for global roles)', () => {
    mockUserRole = 'AM';
    mockTenantId = null;
    renderPage();
    expect(screen.queryByText("You don't have permission to view financial entries.")).not.toBeInTheDocument();
    expect(screen.getByText('Financial Entries')).toBeInTheDocument();
  });
});
