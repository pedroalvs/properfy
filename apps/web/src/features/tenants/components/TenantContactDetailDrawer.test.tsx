import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act , waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { TenantContactDetailDrawer } from './TenantContactDetailDrawer';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../hooks/useTenantContactDetail', () => ({
  useTenantContactDetail: (id: string | null) => {
    if (!id) return { contact: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { contact: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      contact: {
        id: 'tnt-01', name: 'Ana Silva', primaryEmail: 'ana.silva@email.com', primaryPhone: '11999999999',
        confirmationStatus: 'PENDING', appointmentDate: '2026-04-01',
        appointmentId: 'apt-01', appointmentCode: 'VST-001', propertyAddress: 'Rua das Flores, 123',
        lastActivityAt: null, notes: null, alternativePhone: null,
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

function renderDrawer(props: { contactId: string | null; open: boolean; onClose?: () => void }) {
  return render(
    <Wrapper>
      <TenantContactDetailDrawer
        contactId={props.contactId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
      />
    </Wrapper>,
  );
}

describe('TenantContactDetailDrawer', () => {
  it('renders drawer with contact name in header', () => {
    renderDrawer({ contactId: 'tnt-01', open: true });
    const matches = screen.getAllByText('Ana Silva');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows confirmation status chip in header', () => {
    renderDrawer({ contactId: 'tnt-01', open: true });
    const matches = screen.getAllByText('Pendente');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ contactId: 'tnt-01', open: true });
    expect(screen.getByText('Contato')).toBeInTheDocument();
    expect(screen.getByText('Vistoria')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ contactId: 'tnt-01', open: true });
    const editButton = screen.getByLabelText('Editar');
    fireEvent.click(editButton);
    expect(screen.getByText('Edição em breve')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ contactId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Carregando...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ contactId: 'tnt-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when contactId is null', () => {
    renderDrawer({ contactId: null, open: true });
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument();
    expect(screen.queryByText('Contato')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ contactId: 'tnt-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onClose).toHaveBeenCalled();
  });
});
