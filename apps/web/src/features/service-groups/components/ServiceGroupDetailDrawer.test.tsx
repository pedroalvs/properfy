import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act , waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { ServiceGroupDetailDrawer } from './ServiceGroupDetailDrawer';

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

vi.mock('../hooks/useServiceGroupDetail', () => ({
  useServiceGroupDetail: (id: string | null) => {
    if (!id) return { serviceGroup: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { serviceGroup: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      serviceGroup: {
        id: 'sg-01', name: 'Zona Sul SP', regionName: 'São Paulo - Zona Sul',
        status: 'PUBLISHED', priorityMode: 'STANDARD', inspectorName: 'Carlos Silva',
        inspectorId: 'insp-01', tenantId: 'tenant-1',
        appointmentsCount: 3, appointmentCodes: ['VST-001', 'VST-002', 'VST-003'],
        description: 'Test description',
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

function renderDrawer(props: { serviceGroupId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <ServiceGroupDetailDrawer
        serviceGroupId={props.serviceGroupId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('ServiceGroupDetailDrawer', () => {
  it('renders drawer with service group name in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const matches = screen.getAllByText('Zona Sul SP');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows status chip in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const matches = screen.getAllByText('Published');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('edit button calls showInfo snackbar', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ serviceGroupId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when serviceGroupId is null', () => {
    renderDrawer({ serviceGroupId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Information')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ serviceGroupId: 'sg-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('edit button calls onEdit with service group id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ serviceGroupId: 'sg-01', open: true, onEdit });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(onEdit).toHaveBeenCalledWith('sg-01');
  });

  it('edit button falls back to snackbar when onEdit prop is not provided', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const editButton = screen.getByLabelText('Edit');
    fireEvent.click(editButton);
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });
});
