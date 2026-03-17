import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act , waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { FinancialEntryDetailDrawer } from './FinancialEntryDetailDrawer';

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

vi.mock('../hooks/useFinancialEntryDetail', () => ({
  useFinancialEntryDetail: (id: string | null) => {
    if (!id) return { entry: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { entry: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      entry: {
        id: 'fin-01', entryType: 'TENANT_DEBIT', appointmentCode: 'VIST-001',
        description: 'Débito vistoria residencial Centro', amount: 350, currency: 'BRL',
        status: 'APPROVED', effectiveAt: '2026-03-15', relatedEntityName: 'Imob Centro',
        tenantId: 'tenant-1', approvedByName: null, notes: null, approvedAt: null,
        referenceNumber: null,
        createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
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

function renderDrawer(props: { entryId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <FinancialEntryDetailDrawer
        entryId={props.entryId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('FinancialEntryDetailDrawer', () => {
  it('renders drawer with appointment code in header', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    const matches = screen.getAllByText('VIST-001');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows financial status chip in header', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    const matches = screen.getAllByText('Approved');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    expect(screen.getByText('Identification')).toBeInTheDocument();
    expect(screen.getByText('Values')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar when onEdit not provided', () => {
    renderDrawer({ entryId: 'fin-01', open: true });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });

  it('edit button calls onEdit with entry id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ entryId: 'fin-01', open: true, onEdit });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith('fin-01');
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ entryId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ entryId: 'fin-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when entryId is null', () => {
    renderDrawer({ entryId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Identification')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ entryId: 'fin-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
