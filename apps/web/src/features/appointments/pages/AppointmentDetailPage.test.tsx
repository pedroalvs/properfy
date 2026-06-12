import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';

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

let mockUserRole = 'AM';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: mockUserRole, tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockRefetch = vi.fn();

vi.mock('../hooks/useAppointmentDetail', () => ({
  useAppointmentDetail: (id: string | null) => {
    if (!id) return { appointment: null, isLoading: false, isError: false, refetch: mockRefetch };
    if (id === 'loading') return { appointment: null, isLoading: true, isError: false, refetch: mockRefetch };
    if (id === 'error') return { appointment: null, isLoading: false, isError: true, refetch: mockRefetch };
    if (id === 'with-portal-token') {
      return {
        appointment: {
          id: 'with-portal-token',
          code: 'VST-005',
          status: 'SCHEDULED',
          branchName: 'Downtown Branch',
          branchId: 'branch-1',
          propertyId: 'prop-1',
          propertyAddress: '123 Flower Street',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Inspection',
          tenantId: 'tenant-1',
          tenantConfirmationStatus: 'PENDING',
          contactName: 'John',
          scheduledDate: '2026-04-01',
          timeSlot: '09:00-12:00',
          contactPhone: '11999',
          contactEmail: 'john@test.com',
          inspectorId: 'insp-1',
          inspectorName: 'Jane Inspector',
          keyRequired: false,
          meetingLocation: null,
          keyLocation: null,
          cancellationReason: null,
          notes: '',
          doneCheckedByUserId: null,
          doneCheckedAt: null,
          hasActivePortalToken: true,
          isOverdue: false,
          hasTenantNote: false,
          tenantNote: null,
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-03-01T10:00:00Z',
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      };
    }
    if (id === 'awaiting') {
      return {
        appointment: {
          id: 'awaiting',
          code: 'VST-003',
          status: 'AWAITING_INSPECTOR',
          branchName: 'Downtown Branch',
          branchId: 'branch-1',
          propertyId: 'prop-1',
          propertyAddress: '123 Flower Street',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Inspection',
          tenantId: 'tenant-1',
          tenantConfirmationStatus: 'PENDING',
          contactName: 'John',
          scheduledDate: '2026-04-01',
          timeSlot: '09:00-12:00',
          contactPhone: '11999',
          contactEmail: 'john@test.com',
          inspectorId: null,
          inspectorName: null,
          keyRequired: false,
          meetingLocation: null,
          keyLocation: null,
          cancellationReason: null,
          notes: '',
          doneCheckedByUserId: null,
          doneCheckedAt: null,
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-03-01T10:00:00Z',
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      };
    }
    if (id === 'done') {
      return {
        appointment: {
          id: 'done',
          code: 'VST-002',
          status: 'DONE',
          branchName: 'Downtown Branch',
          branchId: 'branch-1',
          propertyId: 'prop-1',
          propertyAddress: '123 Flower Street',
          serviceTypeId: 'st-1',
          serviceTypeName: 'Inspection',
          tenantId: 'tenant-1',
          tenantConfirmationStatus: 'CONFIRMED',
          contactName: 'John',
          scheduledDate: '2026-04-01',
          timeSlot: '09:00-12:00',
          contactPhone: '11999',
          contactEmail: 'john@test.com',
          inspectorId: null,
          inspectorName: null,
          keyRequired: false,
          meetingLocation: null,
          keyLocation: null,
          cancellationReason: null,
          notes: '',
          doneCheckedByUserId: null,
          doneCheckedAt: null,
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-03-01T10:00:00Z',
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      };
    }
    return {
      appointment: {
        id: 'apt-01',
        code: 'VST-001',
        status: 'DRAFT',
        branchName: 'Downtown Branch',
        branchId: 'branch-1',
        propertyId: 'prop-1',
        propertyAddress: '123 Flower Street',
        serviceTypeId: 'st-1',
        serviceTypeName: 'Inspection',
        tenantId: 'tenant-1',
        tenantConfirmationStatus: 'PENDING',
        contactName: 'John',
        scheduledDate: '2026-04-01',
        timeSlot: '09:00-12:00',
        contactPhone: '11999',
        contactEmail: 'john@test.com',
        inspectorId: null,
        inspectorName: null,
        keyRequired: false,
        meetingLocation: null,
        keyLocation: null,
        cancellationReason: null,
        notes: '',
        doneCheckedByUserId: null,
        doneCheckedAt: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
  },
}));

vi.mock('../hooks/useAppointmentTransition', () => ({
  useAppointmentTransition: () => ({
    transition: vi.fn(),
    isTransitioning: false,
  }),
}));

const mockCrossCheckDone = vi.fn();
vi.mock('../hooks/useAppointmentCrossCheck', () => ({
  useAppointmentCrossCheck: () => ({
    crossCheckDone: mockCrossCheckDone,
    isCrossChecking: false,
  }),
}));

vi.mock('../components/AppointmentFormDrawer', () => ({
  AppointmentFormDrawer: ({
    open,
    appointmentId,
  }: {
    open: boolean;
    appointmentId?: string | null;
  }) => (open ? <div>Edit Drawer {appointmentId}</div> : null),
}));

vi.mock('../components/AssignInspectorModal', () => ({
  AssignInspectorModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="assign-inspector-modal">Assign Inspector Modal</div> : null,
}));

import { AppointmentDetailPage } from './AppointmentDetailPage';

function createWrapper(initialEntry: string = '/appointments/apt-01') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
              <Route path="/appointments/:id" element={children} />
              <Route path="/appointments" element={<div>appointment list</div>} />
            </Routes>
          </MemoryRouter>
          <Snackbar />
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function renderPage(initialEntry?: string) {
  const Wrapper = createWrapper(initialEntry);
  return render(
    <Wrapper>
      <AppointmentDetailPage />
    </Wrapper>,
  );
}

describe('AppointmentDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'AM';
  });

  it('renders appointment code in header', () => {
    renderPage();
    expect(screen.getByText('VST-001')).toBeInTheDocument();
  });

  it('renders status chip', () => {
    renderPage();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders tabs', () => {
    renderPage();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('renders Financial tab for AM user', () => {
    renderPage();
    expect(screen.getByText('Financial')).toBeInTheDocument();
  });

  it('shows overview tab content by default', () => {
    renderPage();
    expect(screen.getByText('Inspection Details')).toBeInTheDocument();
  });

  it('switches to contact tab on click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Contact' }));
    expect(screen.getByText('Contact Information')).toBeInTheDocument();
  });

  it('shows loading state while fetching', () => {
    renderPage('/appointments/loading');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state on failure', () => {
    renderPage('/appointments/error');
    expect(screen.getByText('Failed to load appointment details')).toBeInTheDocument();
  });

  it('renders go back button', () => {
    renderPage();
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });

  it('renders edit button', () => {
    renderPage();
    expect(screen.getByLabelText('Edit appointment')).toBeInTheDocument();
  });

  it('opens the edit drawer from the detail page', () => {
    renderPage();
    fireEvent.click(screen.getByLabelText('Edit appointment'));
    expect(screen.getByText('Edit Drawer apt-01')).toBeInTheDocument();
  });

  it('hides edit button for non-editable appointment statuses', () => {
    renderPage('/appointments/done');
    expect(screen.queryByLabelText('Edit appointment')).not.toBeInTheDocument();
  });

  it('shows Confirm Done for privileged users on pending cross-check appointments', () => {
    renderPage('/appointments/done');
    expect(screen.getByText('Confirm Done')).toBeInTheDocument();
  });

  it('calls cross-check hook after confirmation', () => {
    renderPage('/appointments/done');
    fireEvent.click(screen.getByText('Confirm Done'));
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm Done' }).at(-1)!);
    expect(mockCrossCheckDone).toHaveBeenCalled();
  });

  it('renders transition actions for AM user on DRAFT', () => {
    renderPage();
    // AM can Cancel and Reject from DRAFT; cannot Release to Inspector (OP/SYS only)
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Reject')).toBeInTheDocument();
  });

  it('shows Assign Inspector button for OP on AWAITING_INSPECTOR appointment', () => {
    mockUserRole = 'OP';
    renderPage('/appointments/awaiting');
    expect(screen.getByTestId('assign-inspector-button')).toBeInTheDocument();
  });

  it('shows Assign Inspector button for AM on AWAITING_INSPECTOR appointment', () => {
    mockUserRole = 'AM';
    renderPage('/appointments/awaiting');
    expect(screen.getByTestId('assign-inspector-button')).toBeInTheDocument();
  });

  it('does not show Assign Inspector button for OP on DRAFT appointment', () => {
    mockUserRole = 'OP';
    renderPage();
    expect(screen.queryByTestId('assign-inspector-button')).not.toBeInTheDocument();
  });

  it('does not show Assign Inspector button for AM on DRAFT appointment', () => {
    mockUserRole = 'AM';
    renderPage();
    expect(screen.queryByTestId('assign-inspector-button')).not.toBeInTheDocument();
  });

  it('opens assign inspector modal when button clicked', () => {
    mockUserRole = 'OP';
    renderPage('/appointments/awaiting');
    fireEvent.click(screen.getByTestId('assign-inspector-button'));
    expect(screen.getByTestId('assign-inspector-modal')).toBeInTheDocument();
  });
});

// T39 — Copy Portal Link button behaviour

import { api } from '@/services/api';

// The portal-token endpoint reports whether the notification actually went
// out (dispatched/reason); the toast must not claim "Email sent" otherwise.
describe('AppointmentDetailPage — Send Portal Link dispatch feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'AM';
  });

  function mockPortalTokenResponse(payload: Record<string, unknown>) {
    vi.mocked(api.POST).mockResolvedValueOnce({
      data: { data: { token: 'tok', expiresAt: '2026-06-15T19:00:00Z', ...payload } },
      error: undefined,
      response: { status: 201 } as Response,
    } as never);
  }

  it('shows success toast when the email was dispatched', async () => {
    mockPortalTokenResponse({ dispatched: true });
    renderPage('/appointments/awaiting');
    fireEvent.click(screen.getByTestId('send-portal-link-button'));
    await screen.findByText('Email sent to tenant');
  });

  it('warns when no primary contact prevented the dispatch', async () => {
    mockPortalTokenResponse({ dispatched: false, reason: 'NO_PRIMARY_CONTACT' });
    renderPage('/appointments/awaiting');
    fireEvent.click(screen.getByTestId('send-portal-link-button'));
    await screen.findByText('Portal link generated, but no email sent — appointment has no primary contact');
    expect(screen.queryByText('Email sent to tenant')).not.toBeInTheDocument();
  });

  it('warns when the dispatch failed', async () => {
    mockPortalTokenResponse({ dispatched: false, reason: 'DISPATCH_FAILED' });
    renderPage('/appointments/awaiting');
    fireEvent.click(screen.getByTestId('send-portal-link-button'));
    await screen.findByText('Portal link generated, but the email could not be sent — check the Notifications tab');
    expect(screen.queryByText('Email sent to tenant')).not.toBeInTheDocument();
  });
});

// Portal link can only be sent for released, non-terminal appointments:
// AWAITING_INSPECTOR and SCHEDULED. DRAFT/DONE/CANCELLED/REJECTED hide it.
describe('AppointmentDetailPage — Send Portal Link status gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'AM';
  });

  it('hides Send Portal Link for DRAFT appointments', () => {
    renderPage(); // default mock appointment is DRAFT
    expect(screen.queryByTestId('send-portal-link-button')).not.toBeInTheDocument();
  });

  it('shows Send Portal Link for AWAITING_INSPECTOR appointments', () => {
    renderPage('/appointments/awaiting');
    expect(screen.getByTestId('send-portal-link-button')).toBeInTheDocument();
  });

  it('shows Send Portal Link for SCHEDULED appointments', () => {
    renderPage('/appointments/with-portal-token');
    expect(screen.getByTestId('send-portal-link-button')).toBeInTheDocument();
  });

  it('hides Send Portal Link for DONE appointments', () => {
    renderPage('/appointments/done');
    expect(screen.queryByTestId('send-portal-link-button')).not.toBeInTheDocument();
  });
});

describe('AppointmentDetailPage — Copy Portal Link (T39)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRole = 'AM';
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('shows Copy Portal Link button for AM user', () => {
    renderPage();
    expect(screen.getByTestId('copy-portal-link-button')).toBeInTheDocument();
  });

  it('Copy Portal Link is disabled when hasActivePortalToken is false', () => {
    renderPage();
    const btn = screen.getByTestId('copy-portal-link-button');
    expect(btn).toBeDisabled();
  });

  it('disabled button wrapper has tooltip text', () => {
    renderPage();
    const wrapper = screen.getByTestId('copy-portal-link-button').closest('[title]');
    expect(wrapper).toHaveAttribute('title', 'No active portal link — send one first');
  });

  it('Copy Portal Link is enabled when hasActivePortalToken is true', () => {
    renderPage('/appointments/with-portal-token');
    const btn = screen.getByTestId('copy-portal-link-button');
    expect(btn).not.toBeDisabled();
  });

  it('clicking Copy Portal Link calls GET portal-link and writes URL to clipboard', async () => {
    vi.mocked(api.GET).mockResolvedValueOnce({
      data: { data: { portalUrl: 'https://portal.test/portal/abc123', expiresAt: '2026-06-01T19:00:00Z' } },
      error: undefined,
      response: { status: 200 } as Response,
    } as never);
    renderPage('/appointments/with-portal-token');
    fireEvent.click(screen.getByTestId('copy-portal-link-button'));
    await screen.findByText('Portal link copied to clipboard');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://portal.test/portal/abc123');
  });

  it('shows error toast on 409 PORTAL_TOKEN_NOT_DECRYPTABLE', async () => {
    vi.mocked(api.GET).mockResolvedValueOnce({
      data: undefined,
      error: { error: { message: 'Token not decryptable' } },
      response: { status: 409 } as Response,
    } as never);
    renderPage('/appointments/with-portal-token');
    fireEvent.click(screen.getByTestId('copy-portal-link-button'));
    await screen.findByText('Send Portal Link to generate a fresh link');
  });
});
