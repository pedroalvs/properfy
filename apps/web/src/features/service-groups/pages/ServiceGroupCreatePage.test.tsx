import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    use: vi.fn(),
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

vi.mock('@/lib/format-date', () => ({
  formatDate: (d: string) => d,
  formatDateTime: (d: string) => d,
}));

vi.mock('@/hooks/useFormOptions', () => ({
  useFormOptions: (queryKey: string[]) => ({
    options: queryKey[0] === 'tenants'
      ? [{ value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', label: 'Agency One' }]
      : [
          { value: '11111111-1111-4111-8111-111111111111', label: 'Full Inspection' },
          { value: '22222222-2222-4222-8222-222222222222', label: 'Partial Inspection' },
        ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-1',
      role: 'AM',
      tenantId: null,
    },
  }),
}));

const MOCK_ELIGIBLE = Array.from({ length: 8 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  code: `VST-${String(i + 1).padStart(3, '0')}`,
  propertyAddress: `${100 + i} Main St`,
  scheduledDate: `2026-04-${String(i + 1).padStart(2, '0')}`,
  status: 'AWAITING_INSPECTOR',
}));

vi.mock('../hooks/useEligibleAppointments', () => ({
  useEligibleAppointments: (serviceTypeId: string | null, tenantId?: string | null) => ({
    data: serviceTypeId && tenantId ? MOCK_ELIGIBLE : [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/lib/status-colors', () => ({
  PRIORITY_MODE_MAP: {
    STANDARD: { bg: '#eee', text: '#000', label: 'Standard' },
    PRIORITY_24H: { bg: '#ff0', text: '#000', label: '24h Priority' },
  },
  APPOINTMENT_STATUS_MAP: {
    AWAITING_INSPECTOR: { bg: '#FFE0B2', text: '#000', label: 'Awaiting Inspector' },
    DRAFT: { bg: '#E1BEE7', text: '#000', label: 'Draft' },
    SCHEDULED: { bg: '#B3E5FC', text: '#000', label: 'Scheduled' },
    DONE: { bg: '#C8E6C9', text: '#000', label: 'Done' },
    CANCELLED: { bg: '#FFCDD2', text: '#000', label: 'Cancelled' },
    REJECTED: { bg: '#FFAB91', text: '#000', label: 'Rejected' },
  },
}));

import { ServiceGroupCreatePage } from './ServiceGroupCreatePage';
import { api } from '@/services/api';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function createWrapper() {
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
          <MemoryRouter initialEntries={['/service-groups/new']}>
            <Routes>
              <Route path="/service-groups/new" element={children} />
              <Route path="/service-groups/:id" element={<div>detail page</div>} />
              <Route path="/service-groups" element={<div>list page</div>} />
            </Routes>
          </MemoryRouter>
        </SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function renderPage() {
  const Wrapper = createWrapper();
  return render(
    <Wrapper>
      <ServiceGroupCreatePage />
    </Wrapper>,
  );
}

describe('ServiceGroupCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { data: { id: '33333333-3333-4333-8333-333333333333' } } });
  });

  it('renders page title', () => {
    renderPage();
    expect(screen.getByText('New Service Group')).toBeInTheDocument();
  });

  it('shows step indicators', () => {
    renderPage();
    expect(screen.getByText('Select Appointments')).toBeInTheDocument();
    expect(screen.getByText('Configure & Create')).toBeInTheDocument();
  });

  it('shows service type select on step 1', () => {
    renderPage();
    expect(screen.getByLabelText('Agency')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
  });

  it('shows Next button disabled initially', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  function selectAgency() {
    fireEvent.click(screen.getByLabelText('Agency'));
    fireEvent.click(screen.getByRole('option', { name: 'Agency One' }));
  }

  function selectServiceType() {
    // Open the custom SelectInput dropdown
    fireEvent.click(screen.getByLabelText('Service Type'));
    // Click the option
    fireEvent.click(screen.getByRole('option', { name: 'Full Inspection' }));
  }

  function selectMinAppointments() {
    for (let i = 1; i <= 5; i++) {
      fireEvent.click(screen.getByLabelText(`Select VST-${String(i).padStart(3, '0')}`));
    }
  }

  it('shows eligible appointments after selecting service type', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    expect(screen.getByText('Eligible Appointments')).toBeInTheDocument();
  });

  it('shows selection counter after selecting service type', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    expect(screen.getByText(/selected/)).toBeInTheDocument();
  });

  it('enables Next when enough appointments are selected', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    selectMinAppointments();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('advances to step 2 on Next click', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByLabelText('Scheduled Date')).toBeInTheDocument();
    expect(screen.getAllByText('Time Window').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Priority Mode')).toBeInTheDocument();
    expect(screen.getByText('Group Summary')).toBeInTheDocument();
  });

  it('shows Create Group button on step 2', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument();
  });

  it('goes back to step 1 from step 2', () => {
    renderPage();
    selectAgency();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // "Back" appears in both page header and form actions; click the form action one
    const backButtons = screen.getAllByRole('button', { name: 'Back' });
    fireEvent.click(backButtons[backButtons.length - 1]!);
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
  });

  it('shows Back button in page header', () => {
    renderPage();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('requires agency selection before loading eligible appointments for AM', () => {
    renderPage();
    expect(screen.getByText('Select an agency before loading eligible appointments.')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Type')).toBeDisabled();
  });

  it('submits canonical create payload', async () => {
    renderPage();
    selectAgency();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.change(screen.getByLabelText('Scheduled Date'), { target: { value: '2026-04-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Group' }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/v1/service-groups', {
        body: {
          appointmentIds: MOCK_ELIGIBLE.slice(0, 5).map((item) => item.id),
          serviceTypeId: '11111111-1111-4111-8111-111111111111',
          scheduledDate: '2026-04-10',
          timeWindow: '08:00-17:00',
          priorityMode: 'STANDARD',
        },
      });
    });
  });
});
