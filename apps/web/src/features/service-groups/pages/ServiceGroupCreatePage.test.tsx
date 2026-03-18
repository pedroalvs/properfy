import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  useFormOptions: () => ({
    options: [
      { value: 'st-01', label: 'Full Inspection' },
      { value: 'st-02', label: 'Partial Inspection' },
    ],
    isLoading: false,
  }),
}));

const MOCK_ELIGIBLE = Array.from({ length: 8 }, (_, i) => ({
  id: `apt-${String(i + 1).padStart(2, '0')}`,
  code: `VST-${String(i + 1).padStart(3, '0')}`,
  propertyAddress: `${100 + i} Main St`,
  scheduledDate: `2026-04-${String(i + 1).padStart(2, '0')}`,
  status: 'AWAITING_INSPECTOR',
}));

vi.mock('../hooks/useEligibleAppointments', () => ({
  useEligibleAppointments: (serviceTypeId: string | null) => ({
    data: serviceTypeId ? MOCK_ELIGIBLE : [],
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
    expect(screen.getByLabelText('Service Type')).toBeInTheDocument();
  });

  it('shows Next button disabled initially', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

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
    selectServiceType();
    expect(screen.getByText('Eligible Appointments')).toBeInTheDocument();
  });

  it('shows selection counter after selecting service type', () => {
    renderPage();
    selectServiceType();
    expect(screen.getByText(/selected/)).toBeInTheDocument();
  });

  it('enables Next when enough appointments are selected', () => {
    renderPage();
    selectServiceType();
    selectMinAppointments();
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled();
  });

  it('advances to step 2 on Next click', () => {
    renderPage();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByText('Time Window').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Priority Mode')).toBeInTheDocument();
    expect(screen.getByText('Group Summary')).toBeInTheDocument();
  });

  it('shows Create Group button on step 2', () => {
    renderPage();
    selectServiceType();
    selectMinAppointments();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Create Group' })).toBeInTheDocument();
  });

  it('goes back to step 1 from step 2', () => {
    renderPage();
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
});
