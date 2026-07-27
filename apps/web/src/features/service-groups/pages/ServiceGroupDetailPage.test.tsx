import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/lib/format-date', () => ({
  formatDate: (d: string) => d,
  formatDateTime: (d: string) => d,
}));

vi.mock('@/lib/status-colors', () => ({
  SERVICE_GROUP_STATUS_MAP: {
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    PUBLISHED: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    ACCEPTED: { bg: '#C8E6C9', text: '#000', label: 'Accepted' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Canceled' },
  },
  APPOINTMENT_STATUS_MAP: {
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    AWAITING_INSPECTOR: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    SCHEDULED: { bg: '#B3E5FC', text: '#000', label: 'Scheduled' },
    DONE: { bg: '#C8E6C9', text: '#000', label: 'Done' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Cancelled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
}));

const mockRefetch = vi.fn();
const mockPublish = vi.fn();
const mockAssign = vi.fn();
const mockCancel = vi.fn();

vi.mock('../hooks/useServiceGroupDetail', () => ({
  useServiceGroupDetail: (id: string | null) => {
    if (!id) return { serviceGroup: null, isLoading: false, isError: false, refetch: mockRefetch };
    if (id === 'loading') return { serviceGroup: null, isLoading: true, isError: false, refetch: mockRefetch };
    if (id === 'error') return { serviceGroup: null, isLoading: false, isError: true, refetch: mockRefetch };
    if (id === 'published') return {
      serviceGroup: {
        id: 'published',
        name: 'Pub Group',
        status: 'PUBLISHED',
        tenantId: 't-1',
        regionName: 'Region A',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 10,
        appointments: [
          { id: 'apt-pub-01', appointmentNumber: 2001, status: 'DRAFT', scheduledDate: '2026-03-10', propertyAddress: '10 Pub St', propertyCode: 'VST-001' },
        ],
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    if (id === 'accepted') return {
      serviceGroup: {
        id: 'accepted',
        name: 'Acc Group',
        status: 'ACCEPTED',
        tenantId: 't-1',
        regionName: 'Region B',
        inspectorId: 'insp-1',
        inspectorName: 'Carlos Silva',
        appointmentsCount: 8,
        appointments: [
          { id: 'apt-acc-01', appointmentNumber: 3001, status: 'SCHEDULED', scheduledDate: '2026-03-15', propertyAddress: '20 Acc Ave', propertyCode: 'VST-005' },
        ],
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    // Republished groups arrive empty: cancelling unlinks every appointment.
    if (id === 'empty') return {
      serviceGroup: {
        id: 'empty',
        code: '9',
        status: 'DRAFT',
        tenantId: 't-1',
        regionName: 'Region D',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 0,
        appointments: [],
        scheduledDate: '2026-06-01',
        timeWindow: '09:00-12:00',
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    if (id === 'past-date') return {
      serviceGroup: {
        id: 'past-date',
        code: '10',
        status: 'DRAFT',
        tenantId: 't-1',
        regionName: 'Region E',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 1,
        appointments: [
          { id: 'apt-past-01', appointmentNumber: 4001, status: 'AWAITING_INSPECTOR', scheduledDate: '2026-04-30', propertyAddress: '1 Past St', propertyCode: 'VST-010' },
        ],
        scheduledDate: '2026-04-30',
        timeWindow: '09:00-12:00',
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    if (id === 'blocking-status') return {
      serviceGroup: {
        id: 'blocking-status',
        code: '11',
        status: 'DRAFT',
        tenantId: 't-1',
        regionName: 'Region F',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 1,
        appointments: [
          { id: 'apt-blk-01', appointmentNumber: 5001, status: 'CANCELLED', scheduledDate: '2026-06-01', propertyAddress: '2 Blocked St', propertyCode: 'VST-011' },
        ],
        scheduledDate: '2026-06-01',
        timeWindow: '09:00-12:00',
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    if (id === 'cancelled') return {
      serviceGroup: {
        id: 'cancelled',
        name: 'Canc Group',
        status: 'CANCELLED',
        tenantId: 't-1',
        regionName: 'Region C',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 5,
        appointments: [],
        description: null,
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
    return {
      serviceGroup: {
        id: 'sg-01',
        groupNumber: 7,
        code: '7',
        status: 'DRAFT',
        tenantId: 't-1',
        regionName: 'São Paulo',
        inspectorId: null,
        inspectorName: null,
        appointmentsCount: 12,
        appointments: [
          { id: 'apt-01', appointmentNumber: 1001, status: 'AWAITING_INSPECTOR', scheduledDate: '2026-06-01', propertyAddress: '123 Main St', propertyCode: 'VST-001' },
          { id: 'apt-02', appointmentNumber: 1002, status: 'AWAITING_INSPECTOR', scheduledDate: '2026-06-01', propertyAddress: '456 Oak Ave', propertyCode: 'VST-002' },
        ],
        scheduledDate: '2026-06-01',
        timeWindow: '09:00-12:00',
        description: 'Some notes',
        createdAt: '2026-03-01T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
      },
      isLoading: false,
      isError: false,
      refetch: mockRefetch,
    };
  },
}));

vi.mock('../hooks/usePublishServiceGroup', () => ({
  usePublishServiceGroup: () => ({
    publish: mockPublish,
    isPublishing: false,
  }),
}));

vi.mock('../hooks/useAssignInspector', () => ({
  useAssignInspector: () => ({
    assign: mockAssign,
    isAssigning: false,
  }),
}));

vi.mock('../hooks/useCancelServiceGroup', () => ({
  useCancelServiceGroup: () => ({
    cancel: mockCancel,
    isCancelling: false,
  }),
}));

const mockSendPortalLinks = vi.fn();
vi.mock('../hooks/useSendGroupPortalLinks', () => ({
  useSendGroupPortalLinks: () => ({
    send: mockSendPortalLinks,
    isSending: false,
  }),
}));

vi.mock('../hooks/useGroupPortalLinkPlan', () => ({
  useGroupPortalLinkPlan: () => ({
    plan: {
      items: [],
      summary: { total: 2, willSend: 2, willResendDateChanged: 0, alreadyConfirmed: 0, notSendable: 0 },
    },
    isLoading: false,
    isError: false,
  }),
}));

import { ServiceGroupDetailPage } from './ServiceGroupDetailPage';

function createWrapper(initialEntry: string = '/service-groups/sg-01') {
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
              <Route path="/service-groups/:id" element={children} />
              <Route path="/service-groups" element={<div>list page</div>} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function renderPage(initialEntry?: string) {
  const Wrapper = createWrapper(initialEntry);
  return render(
    <Wrapper>
      <ServiceGroupDetailPage />
    </Wrapper>,
  );
}

describe('ServiceGroupDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Publish is gated on the group schedule, which the shared validator
    // resolves against "now" in Sydney. Pin it (Date only, timers stay real)
    // so the fixtures below keep the same meaning on any day.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders group code in header', () => {
    renderPage();
    expect(screen.getAllByText('Group 7').length).toBeGreaterThanOrEqual(1);
  });

  it('renders status chip', () => {
    renderPage();
    // Status chip appears in header and detail sections
    expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Publish button for DRAFT status', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Publish/ })).toBeInTheDocument();
  });

  it('calls publish on button click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
    expect(mockPublish).toHaveBeenCalled();
  });

  it('blocks Publish for a group with no appointments', () => {
    renderPage('/service-groups/empty');
    const button = screen.getByRole('button', { name: /Publish/ });
    expect(button).toBeDisabled();
    // Scoped to the banner copy — the appointments section has its own
    // "No appointments" empty state.
    const banner = screen.getByText(/this group has no appointments/i);
    expect(banner).toBeInTheDocument();
    // The reason must be announced, not just shown next to the button.
    expect(button).toHaveAttribute('aria-describedby', banner.id);
    fireEvent.click(button);
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('blocks Publish for a group whose scheduled date has passed', () => {
    renderPage('/service-groups/past-date');
    expect(screen.getByRole('button', { name: /Publish/ })).toBeDisabled();
    expect(screen.getByText(/scheduled date is in the past/i)).toBeInTheDocument();
  });

  it('blocks Publish while an appointment is not awaiting inspector', () => {
    renderPage('/service-groups/blocking-status');
    expect(screen.getByRole('button', { name: /Publish/ })).toBeDisabled();
    expect(screen.getByText(/#5001 \(CANCELLED\)/)).toBeInTheDocument();
  });

  it('enables Publish for a valid future group and describes nothing', () => {
    renderPage();
    const button = screen.getByRole('button', { name: /Publish/ });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('shows Cancel Group button for DRAFT status', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Cancel Group/ })).toBeInTheDocument();
  });

  it('shows the Change menu for PUBLISHED status', () => {
    renderPage('/service-groups/published');
    expect(screen.getByTestId('service-group-change-trigger')).toBeInTheDocument();
  });

  it('shows the Change menu for DRAFT status', () => {
    renderPage();
    expect(screen.getByTestId('service-group-change-trigger')).toBeInTheDocument();
  });

  it('shows the Change menu for ACCEPTED status — plan edits survive acceptance', () => {
    renderPage('/service-groups/accepted');
    expect(screen.getByTestId('service-group-change-trigger')).toBeInTheDocument();
  });

  it('shows assigned inspector for ACCEPTED status', () => {
    renderPage('/service-groups/accepted');
    // Inspector name appears in detail sections and inspector panel
    expect(screen.getAllByText('Carlos Silva').length).toBeGreaterThanOrEqual(1);
  });

  it('hides action buttons for CANCELLED status', () => {
    renderPage('/service-groups/cancelled');
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Group/ })).not.toBeInTheDocument();
    // A closed group has no schedule left to move and nobody to hand it to.
    expect(screen.queryByTestId('service-group-change-trigger')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send portal link/ })).not.toBeInTheDocument();
  });

  it('shows Send portal link button for DRAFT status', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /Send portal link/ })).toBeInTheDocument();
  });

  it('shows Send portal link button for ACCEPTED status', () => {
    renderPage('/service-groups/accepted');
    expect(screen.getByRole('button', { name: /Send portal link/ })).toBeInTheDocument();
  });

  it('opens the Send portal link dialog on click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Send portal link/ }));
    // The dialog body shows the preview summary.
    expect(screen.getByText(/will be sent/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderPage('/service-groups/loading');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows error state', () => {
    renderPage('/service-groups/error');
    expect(screen.getByText('Failed to load service group details')).toBeInTheDocument();
  });

  it('renders go back button', () => {
    renderPage();
    expect(screen.getByLabelText('Go back')).toBeInTheDocument();
  });

  it('falls back to the service-groups list when back is clicked with no in-app history', () => {
    // Opened in a new tab (window.open _blank) from the map → no history to pop.
    renderPage();
    fireEvent.click(screen.getByLabelText('Go back'));
    expect(screen.getByText('list page')).toBeInTheDocument();
  });

  it('opens cancel modal on Cancel Group click', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Cancel Group/ }));
    expect(screen.getByText('Cancel Service Group')).toBeInTheDocument();
  });

  it('opens the assign modal from the Change menu', () => {
    renderPage('/service-groups/published');
    fireEvent.click(screen.getByTestId('service-group-change-trigger'));
    fireEvent.click(screen.getByTestId('group-action-change-inspector'));
    expect(screen.getByText('Assign Inspector')).toBeInTheDocument();
  });

  it('offers replacement rather than assignment on an ACCEPTED group', () => {
    renderPage('/service-groups/accepted');
    fireEvent.click(screen.getByTestId('service-group-change-trigger'));
    fireEvent.click(screen.getByTestId('group-action-change-inspector'));
    expect(screen.getByText('Change Inspector')).toBeInTheDocument();
  });

  it('opens the reschedule modal on Change date', () => {
    renderPage('/service-groups/published');
    fireEvent.click(screen.getByTestId('service-group-change-trigger'));
    fireEvent.click(screen.getByTestId('group-action-change-date'));
    expect(screen.getByText('Change date')).toBeInTheDocument();
  });

  it('opens the reschedule modal on Change time window', () => {
    renderPage('/service-groups/published');
    fireEvent.click(screen.getByTestId('service-group-change-trigger'));
    fireEvent.click(screen.getByTestId('group-action-change-time-window'));
    expect(screen.getByText('Change time window')).toBeInTheDocument();
  });
});
