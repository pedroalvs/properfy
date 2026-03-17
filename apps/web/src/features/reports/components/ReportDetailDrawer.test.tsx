import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act , waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
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
        id: 'rpt-01', reportType: 'INSPECTIONS_SCHEDULED', status: 'READY',
        format: 'XLSX', requestedByName: 'Admin Principal',
        fileName: 'vistorias-agendadas-marco-2026.xlsx', fileSize: 1048576,
        parameters: null,
        createdAt: '2026-03-15T10:00:00Z', updatedAt: '2026-03-15T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
  },
}));


function SnackbarDisplay() {
  const { messages } = useSnackbar();
  return (
    <div data-testid="snackbar-display">
      {messages.map((m) => (
        <div key={m.id}>{m.message}</div>
      ))}
    </div>
  );
}

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={testQueryClient}>
      <SnackbarProvider>
      {children}
      <SnackbarDisplay />
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
    const matches = screen.getAllByText('vistorias-agendadas-marco-2026.xlsx');
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

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ reportId: 'rpt-01', open: true });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
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
