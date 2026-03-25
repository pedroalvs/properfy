import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
const mockPost = api.POST as ReturnType<typeof vi.fn>;

const MOCK_REPORTS = [
  { id: 'rpt-01', reportType: 'INSPECTIONS_SCHEDULED', status: 'READY', format: 'XLSX', requestedBy: { id: 'u-1', name: 'Admin Principal' }, fileKey: 'reports/rpt-01.xlsx', filters: { fromDate: '2026-03-01', toDate: '2026-03-15' }, createdAt: '2026-03-15' },
  { id: 'rpt-02', reportType: 'FINANCIAL_SERVICES', status: 'FAILED', format: 'XLSX', requestedBy: { id: 'u-1', name: 'Admin Principal' }, fileKey: null, filters: { fromDate: '2026-03-01', toDate: '2026-03-16' }, createdAt: '2026-03-16' },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
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
  mockPost.mockReset();
  mockGet.mockResolvedValue({ data: {
    data: MOCK_REPORTS,
    pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
  } });
  mockPost.mockResolvedValue({ data: { message: 'ok' } });
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
    expect(screen.getByLabelText('From Date')).toBeInTheDocument();
    expect(screen.getByLabelText('To Date')).toBeInTheDocument();
  });

  it('renders data table with report data after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Admin Principal').length).toBeGreaterThan(0);
    });
  });

  it('downloads reports using the backend download url contract', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement');
    const clickSpy = vi.fn();
    const anchor = originalCreateElement('a');
    Object.defineProperty(anchor, 'click', { value: clickSpy });

    createElementSpy.mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return anchor;
      }
      return originalCreateElement(tagName);
    });

    mockGet
      .mockResolvedValueOnce({
        data: {
          data: MOCK_REPORTS,
          pagination: { page: 1, pageSize: 10, total: 2, totalPages: 1 },
        },
      })
      .mockResolvedValueOnce({ data: { downloadUrl: 'https://cdn.example.com/report.xlsx', expiresAt: '2026-03-24T12:00:00Z' } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Download')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Download'));

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/v1/reports/rpt-01/download', {});
    });

    expect(anchor.href).toBe('https://cdn.example.com/report.xlsx');
    expect(anchor.download).toBe('rpt-01.xlsx');
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it('reprocesses failed reports through POST /v1/reports with persisted filters', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Reprocess')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText('Reprocess'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/v1/reports', {
        body: {
          reportType: 'FINANCIAL_SERVICES',
          filters: { fromDate: '2026-03-01', toDate: '2026-03-16' },
          format: 'XLSX',
        },
      });
    });
  });
});
