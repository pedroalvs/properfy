import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_INVOICES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
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

  it('renders filter bar with inspector search and status filter', () => {
    renderPage();
    expect(screen.getByLabelText('Inspector')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders Agency and Branch content filters and no agency gate (spec 032)', async () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Branch')).toBeInTheDocument();
    // The old "Select an agency to view invoices" gate is gone — data renders immediately.
    expect(screen.queryByText(/Select an agency to view invoices/i)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('insp-01')).toBeInTheDocument());
  });

  it('renders period date range filters', () => {
    renderPage();
    expect(screen.getByLabelText('Period - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Period - end')).toBeInTheDocument();
  });

  it('renders data table with invoice data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('insp-01')).toBeInTheDocument();
      expect(screen.getByText('insp-02')).toBeInTheDocument();
    });
  });

  it('mounts ReconciliationSummary (T067)', () => {
    renderPage();
    expect(screen.getByTestId('reconciliation-summary')).toBeInTheDocument();
    expect(screen.getByText('Total Invoiced')).toBeInTheDocument();
  });
});
