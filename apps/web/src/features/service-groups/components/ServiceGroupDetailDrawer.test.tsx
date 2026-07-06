import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
        id: 'sg-01', groupNumber: 12, code: '12', regionName: 'São Paulo - Zona Sul',
        status: 'PUBLISHED', inspectorName: 'Carlos Silva',
        inspectorId: 'insp-01', tenantId: 'tenant-1',
        appointmentsCount: 3,
        appointments: [
          { id: 'apt-01', appointmentNumber: 1001, status: 'DRAFT', scheduledDate: '2026-03-10', propertyAddress: '123 Main St', propertyCode: 'VST-001' },
          { id: 'apt-02', appointmentNumber: 1002, status: 'DRAFT', scheduledDate: '2026-03-11', propertyAddress: '456 Oak Ave', propertyCode: 'VST-002' },
          { id: 'apt-03', appointmentNumber: 1003, status: 'DRAFT', scheduledDate: '2026-03-12', propertyAddress: '789 Pine Rd', propertyCode: 'VST-003' },
        ],
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
      <MemoryRouter>
        <SnackbarProvider>
        {children}
        <SnackbarDisplay />
        </SnackbarProvider>
      </MemoryRouter>
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
  it('renders drawer with service group code in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const matches = screen.getAllByText('Group 12');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows status chip in header', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    const matches = screen.getAllByText('Awaiting Inspector');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows detail sections', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
  });

  it('hides edit button when onEdit prop is not provided', () => {
    renderDrawer({ serviceGroupId: 'sg-01', open: true });
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
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

});
