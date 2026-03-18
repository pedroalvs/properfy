import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider, useSnackbar } from '@/hooks/useSnackbar';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';

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

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: vi.fn() };
    if (id === 'loading') return { appointment: null, isLoading: true, isError: false, refetch: vi.fn() };
    return {
      appointment: {
        id: 'apt-01', code: 'VST-001', status: 'DRAFT', branchName: 'Downtown Branch',
        branchId: 'branch-1', propertyId: 'prop-1', propertyAddress: '123 Flower Street',
        serviceTypeId: 'st-1', serviceTypeName: 'Inspection', tenantId: 'tenant-1',
        tenantConfirmationStatus: 'PENDING', contactName: 'John', scheduledDate: '2026-04-01',
        timeSlot: '09:00-12:00', contactPhone: '11999', contactEmail: 'john@test.com',
        inspectorId: null, inspectorName: null, keyRequired: false,
        meetingLocation: null, keyLocation: null, cancellationReason: null,
        notes: '', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    };
  },
}));

vi.mock('../hooks/useAppointmentTransition', () => ({
  useAppointmentTransition: () => ({
    transition: vi.fn(),
    isTransitioning: false,
  }),
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
        <MemoryRouter>
          {children}
          <SnackbarDisplay />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
}

function renderDrawer(props: { appointmentId: string | null; open: boolean; onClose?: () => void; onEdit?: (id: string) => void }) {
  return render(
    <Wrapper>
      <AppointmentDetailDrawer
        appointmentId={props.appointmentId}
        open={props.open}
        onClose={props.onClose ?? vi.fn()}
        onEdit={props.onEdit}
      />
    </Wrapper>,
  );
}

describe('AppointmentDetailDrawer', () => {
  it('renders drawer with appointment code in header', () => {
    renderDrawer({ appointmentId: 'apt-01', open: true });
    expect(screen.getByText('VST-001')).toBeInTheDocument();
  });

  it('shows status chip in header', () => {
    renderDrawer({ appointmentId: 'apt-01', open: true });
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('shows detail sections', () => {
    renderDrawer({ appointmentId: 'apt-01', open: true });
    expect(screen.getByText('Inspection Details')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('shows "Open full detail" button', () => {
    renderDrawer({ appointmentId: 'apt-01', open: true });
    expect(screen.getByText('Open full detail')).toBeInTheDocument();
  });

  it('edit button calls onEdit with appointment id when onEdit prop is provided', () => {
    const onEdit = vi.fn();
    renderDrawer({ appointmentId: 'apt-01', open: true, onEdit });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('apt-01');
  });

  it('edit button falls back to snackbar when onEdit prop is not provided', () => {
    renderDrawer({ appointmentId: 'apt-01', open: true });
    fireEvent.click(screen.getByLabelText('Edit'));
    expect(screen.getByText('Editing coming soon')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderDrawer({ appointmentId: 'loading', open: true });
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it('drawer panel is hidden when closed', () => {
    renderDrawer({ appointmentId: 'apt-01', open: false });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('translate-x-full');
  });

  it('shows nothing when appointmentId is null', () => {
    renderDrawer({ appointmentId: null, open: true });
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(screen.queryByText('Inspection Details')).not.toBeInTheDocument();
  });

  it('close button calls onClose', () => {
    const onClose = vi.fn();
    renderDrawer({ appointmentId: 'apt-01', open: true, onClose });
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
