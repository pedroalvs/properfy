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
import { ReportListPage } from './ReportListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_REPORTS = [
  { id: 'rpt-01', reportType: 'INSPECTIONS_SCHEDULED', status: 'PENDING', requestedBy: { id: 'u-1', name: 'Admin Principal' }, createdAt: '2026-03-15' },
  { id: 'rpt-02', reportType: 'FINANCIAL_SERVICES', status: 'PROCESSING', requestedBy: { id: 'u-1', name: 'Admin Principal' }, createdAt: '2026-03-16' },
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
    data: MOCK_REPORTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><ReportListPage /></Wrapper>);
}

describe('ReportListPage', () => {
  it('renders page title "Relatórios"', () => {
    renderPage();
    expect(screen.getByText('Reports')).toBeInTheDocument();
  });

  it('renders "Generate Report" CTA button', () => {
    renderPage();
    expect(screen.getByText('Generate Report')).toBeInTheDocument();
  });

  it('renders filter bar with type and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with report data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Admin Principal').length).toBeGreaterThan(0);
    });
  });
});
