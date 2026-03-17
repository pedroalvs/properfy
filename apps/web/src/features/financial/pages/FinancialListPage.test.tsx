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
import { FinancialListPage } from './FinancialListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_ENTRIES = [
  { id: 'fin-01', entryType: 'TENANT_DEBIT', appointmentCode: 'VIST-001', description: 'Débito vistoria residencial Centro', amount: 350, status: 'PENDING', effectiveAt: '2026-03-15', relatedEntityName: 'Imob Centro' },
  { id: 'fin-02', entryType: 'INSPECTOR_PAYOUT', appointmentCode: 'VIST-002', description: 'Pagamento inspetor Diego - vistoria Centro', amount: 180, status: 'APPROVED', effectiveAt: '2026-03-16', relatedEntityName: 'Diego' },
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
    data: MOCK_ENTRIES,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><FinancialListPage /></Wrapper>);
}

describe('FinancialListPage', () => {
  it('renders page title "Financial"', () => {
    renderPage();
    expect(screen.getByText('Financial')).toBeInTheDocument();
  });

  it('renders "New Entry" CTA button', () => {
    renderPage();
    const matches = screen.getAllByText('New Entry');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('renders filter bar with search, type, and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Search')).toBeInTheDocument();
    const typeLabels = screen.getAllByLabelText('Type');
    expect(typeLabels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with financial data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('VIST-001')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderPage();
    expect(screen.getByText('Inspection')).toBeInTheDocument();
  });
});
