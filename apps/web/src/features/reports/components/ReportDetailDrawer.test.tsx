import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { ReportDetailDrawer } from './ReportDetailDrawer';

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

vi.mock('../hooks/useReportDetail', () => ({
  useReportDetail: (id: string | null) => {
    if (!id) return { report: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { report: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      report: {
        id: 'rpt-01', reportType: 'APPOINTMENTS', status: 'READY',
        requestedBy: { id: 'u-1', name: 'Admin Principal' },
        fileKey: 'reports/appointments-march-2026.xlsx', fileSize: 1048576,
        filters: { fromDate: '2026-03-01', toDate: '2026-03-15', dateAxis: 'SCHEDULED', groupProperties: false },
        createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
  },
}));

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <SnackbarProvider>
      {children}
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function renderDrawer(props: { reportId: string | null; open: boolean; onClose?: () => void }) {
  return render(
    <Wrapper>
      <ReportDetailDrawer
        reportId={props.reportId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
      />
    </Wrapper>,
  );
}

describe('ReportDetailDrawer', () => {
  it('renders drawer with report file name in header', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    const matches = screen.getAllByText('appointments-march-2026.xlsx');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows report status chip in header', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    const matches = screen.getAllByText('Ready');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    expect(screen.getAllByText('Report').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ reportId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ reportId: 'rpt-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when reportId is null', () => {
    renderDrawer({ reportId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('File')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ reportId: 'rpt-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
