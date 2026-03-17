import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
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

import { apiClient } from '@/lib/api-client';
import { ReportListPage } from './ReportListPage';

const mockGet = apiClient.get as ReturnType<typeof vi.fn>;

const MOCK_REPORTS = [
  { id: 'rpt-01', reportType: 'INSPECTIONS_SCHEDULED', status: 'PENDING', requestedByName: 'Admin Principal', createdAt: '2026-03-15' },
  { id: 'rpt-02', reportType: 'FINANCIAL_SERVICES', status: 'PROCESSING', requestedByName: 'Admin Principal', createdAt: '2026-03-16' },
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
  mockGet.mockResolvedValue({
    data: MOCK_REPORTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><ReportListPage /></Wrapper>);
}

describe('ReportListPage', () => {
  it('renders page title "Relatórios"', () => {
    renderPage();
    expect(screen.getByText('Relatórios')).toBeInTheDocument();
  });

  it('renders "Gerar Relatório" CTA button', () => {
    renderPage();
    expect(screen.getByText('Gerar Relatório')).toBeInTheDocument();
  });

  it('renders filter bar with type and status controls', () => {
    renderPage();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
  });

  it('renders data table with report data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Admin Principal').length).toBeGreaterThan(0);
    });
  });
});
