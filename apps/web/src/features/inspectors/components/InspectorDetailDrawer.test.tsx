import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act , waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { InspectorDetailDrawer } from './InspectorDetailDrawer';

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

vi.mock('../hooks/useInspectorDetail', () => ({
  useInspectorDetail: (id: string | null) => {
    if (!id) return { inspector: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { inspector: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      inspector: {
        id: 'insp-01', name: 'Carlos Silva', email: 'carlos@inspecoes.com', phone: '11999999999',
        document: '123.456.789-00', status: 'ACTIVE', regions: ['Zona Sul'], serviceTypes: ['Vistoria'],
        regionsCount: 1, serviceTypesCount: 1, rating: 4.5,
        createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z',
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

function renderDrawer(props: { inspectorId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <InspectorDetailDrawer
        inspectorId={props.inspectorId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('InspectorDetailDrawer', () => {
  it('renders drawer with inspector name in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const matches = screen.getAllByText('Carlos Silva');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows inspector status chip in header', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows detail sections', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ inspectorId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ inspectorId: 'insp-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when inspectorId is null', () => {
    renderDrawer({ inspectorId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal Details')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ inspectorId: 'insp-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('edit button calls onEdit with inspector id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ inspectorId: 'insp-01', open: true, onEdit });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('insp-01');
  });

  it('edit button falls back to snackbar when onEdit prop is not provided', () => {
    renderDrawer({ inspectorId: 'insp-01', open: true });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });
});
