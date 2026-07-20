import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { api } from '@/services/api';
import { InvoicesPage } from './InvoicesPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_INVOICES = [
  { id: 'inv-01', inspectorId: 'insp-01', periodStart: '2026-03-01', periodEnd: '2026-03-15', invoiceNumber: null, invoiceNumberDisplay: null, periodType: 'FORTNIGHTLY', totalAmount: 1800, currency: 'AUD', status: 'CLOSED', fileKey: 'invoices/inv-01.pdf', issuedAt: '2026-03-16T10:00:00Z', paidAt: null, createdAt: '2026-03-16T10:00:00Z' },
  { id: 'inv-02', inspectorId: 'insp-02', periodStart: '2026-03-01', periodEnd: '2026-03-31', invoiceNumber: null, invoiceNumberDisplay: null, periodType: 'MONTHLY', totalAmount: 3200, currency: 'AUD', status: 'PAID', fileKey: 'invoices/inv-02.pdf', issuedAt: '2026-03-16T10:00:00Z', paidAt: '2026-03-20T10:00:00Z', createdAt: '2026-03-16T10:00:00Z' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>{children}</SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

const MOCK_SUMMARY = {
  currency: 'AUD',
  totalCount: 2,
  pendingCount: 0,
  approvedCount: 1,
  paidCount: 1,
  voidCount: 0,
  pendingAmount: 0,
  paidAmount: 3200,
};

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/v1/billing/invoices/summary') {
      return { data: { data: MOCK_SUMMARY } };
    }
    return { data: {
      data: MOCK_INVOICES,
      pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
    } };
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><InvoicesPage /></Wrapper>);
}

describe('InvoicesPage', () => {
  it('renders page title "Invoices"', () => {
    renderPage();
    expect(screen.getByText('Invoices')).toBeInTheDocument();
  });

  it('renders filter bar with inspector filter and NO status select (tabs own status)', () => {
    renderPage();
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
  });

  it('renders Pending and Done tabs with Pending active by default', async () => {
    renderPage();
    const pendingTab = screen.getByRole('tab', { name: 'Pending' });
    const doneTab = screen.getByRole('tab', { name: 'Done' });
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
    expect(doneTab).toHaveAttribute('aria-selected', 'false');
    // The default list request carries the pending status filter.
    await waitFor(() => {
      const listCall = mockGet.mock.calls.find(([path]) => path === '/v1/billing/invoices');
      expect(listCall?.[1]?.params?.query?.status).toBe('pending');
    });
  });

  it('switching to Done requests the done status bucket', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Done' }));
    await waitFor(() => {
      const listCalls = mockGet.mock.calls.filter(([path]) => path === '/v1/billing/invoices');
      const last = listCalls[listCalls.length - 1];
      expect(last?.[1]?.params?.query?.status).toBe('done');
    });
  });

  it('renders Agency and Branch content filters and no agency gate (spec 032)', async () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    // The old "Select an agency to view invoices" gate is gone — data renders immediately.
    expect(screen.queryByText(/Select an agency to view invoices/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Fortnightly')).toBeInTheDocument());
  });

  it('renders period date range filters', () => {
    renderPage();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
  });

  it('renders data table with invoice data after loading', async () => {
    renderPage();
    // Assert on readable per-row content (period type), never the raw inspector id.
    await waitFor(() => {
      expect(screen.getByText('Fortnightly')).toBeInTheDocument();
      expect(screen.getByText('Monthly')).toBeInTheDocument();
    });
  });

  it('mounts the summary indicators above the tabs', () => {
    renderPage();
    expect(screen.getByTestId('invoice-summary-indicators')).toBeInTheDocument();
    expect(screen.getByText('Pending Amount')).toBeInTheDocument();
    expect(screen.getByText('Paid Amount')).toBeInTheDocument();
  });
});
