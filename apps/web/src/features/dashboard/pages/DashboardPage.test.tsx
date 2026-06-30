import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

const mockGET = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    GET: (...args: unknown[]) => mockGET(...args),
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

import { DashboardPage } from './DashboardPage';

const BASE_STATS = {
  appointmentsByStatus: {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
    doneThisWeek: 7,
    scheduledThisWeek: 10,
    rejectedTotal: 5,
  },
  recentAppointments: [
    { id: 'apt-15', code: 'VST-015', propertyAddress: 'Address 15', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-04-01' },
    { id: 'apt-14', code: 'VST-014', propertyAddress: 'Address 14', status: 'DONE', doneCheckedByUserId: null, scheduledDate: '2026-03-31' },
    { id: 'apt-13', code: 'VST-013', propertyAddress: 'Address 13', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-03-30' },
    { id: 'apt-12', code: 'VST-012', propertyAddress: 'Address 12', status: 'DRAFT', doneCheckedByUserId: null, scheduledDate: '2026-03-29' },
    { id: 'apt-07', code: 'VST-007', propertyAddress: 'Address 07', status: 'DONE', doneCheckedByUserId: 'op-1', scheduledDate: '2026-03-28' },
  ],
  pendingActions: {
    noResponseRentalTenants: 2,
    pendingOperatorCrossChecks: 3,
    pendingFinancialEntries: 5,
    processingReports: 2,
  },
  quickStats: {
    totalProperties: 15,
    activeInspectors: 12,
    activeServiceGroups: 9,
  },
};

const MOCK_STATS_WITH_BREAKDOWNS = {
  ...BASE_STATS,
  inspectorBreakdowns: {
    tomorrowByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 18, alertLevel: 'red' },
    ],
    scheduledThisWeekByInspector: [
      { inspectorId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', inspectorName: 'Alice', count: 25, alertLevel: null },
    ],
    confirmedThisWeekByInspector: [
      { inspectorId: 'b1ffcd00-0a1c-4ef9-cc7e-7cc0ce491b22', inspectorName: 'Bob', count: 12, alertLevel: null },
    ],
  },
};

const MOCK_STATS_NULL_BREAKDOWNS = {
  ...BASE_STATS,
  inspectorBreakdowns: null,
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.pathname}{location.search}</div>;
}

beforeEach(() => {
  mockGET.mockReset();
  mockGET.mockResolvedValue({ data: { data: MOCK_STATS_WITH_BREAKDOWNS }, error: undefined });
});

function renderPage() {
  const Wrapper = createWrapper();
  return render(<Wrapper><DashboardPage /></Wrapper>);
}

describe('DashboardPage', () => {
  it('renders page title "Dashboard"', () => {
    renderPage();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    renderPage();
    const loadingEl = screen.getByRole('status');
    expect(loadingEl).toHaveAttribute('aria-busy', 'true');
  });

  it('renders summary cards after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByText('Draft').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Awaiting Inspector').length).toBeGreaterThanOrEqual(1);
  });

  it('renders new scalar cards (Rejected Total, Done This Week, Scheduled This Week)', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Rejected Total')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Done This Week').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Scheduled This Week').length).toBeGreaterThanOrEqual(1);
  });

  it('renders recent appointments section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Recent Appointments')).toBeInTheDocument();
    });
  });

  it('renders pending actions section', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Pending Actions')).toBeInTheDocument();
    });
  });

  it('hides loading state after data loads', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  // ─── Inspector breakdown section ──────────────────────────────────────────

  it('renders InspectorBreakdownSection when inspectorBreakdowns is populated', async () => {
    renderPage();
    await waitFor(() => {
      // The section renders the three cards — Confirmed This Week is only present in InspectorBreakdownSection
      expect(screen.getByText('Confirmed This Week')).toBeInTheDocument();
    });
  });

  it('does NOT render InspectorBreakdownSection when inspectorBreakdowns is null', async () => {
    mockGET.mockResolvedValue({ data: { data: MOCK_STATS_NULL_BREAKDOWNS }, error: undefined });
    renderPage();

    await waitFor(() => {
      // Summary cards should be visible
      expect(screen.getByText('Rejected Total')).toBeInTheDocument();
    });

    expect(screen.queryByText('Confirmed This Week')).not.toBeInTheDocument();
  });

  // ─── Navigation ───────────────────────────────────────────────────────────

  it('navigates to appointment detail when a recent appointment is clicked', async () => {
    const user = userEvent.setup();
    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Recent Appointments')).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId('appointment-row');
    await user.click(rows[0]!);

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/appointments/apt-15');
    });
  });

  it('navigates to appointments list when "View all" is clicked', async () => {
    const user = userEvent.setup();
    const Wrapper = createWrapper();

    render(
      <Wrapper>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="*" element={<LocationDisplay />} />
        </Routes>
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('View all')).toBeInTheDocument();
    });

    await user.click(screen.getByText('View all'));

    await waitFor(() => {
      expect(screen.getByTestId('location-display')).toHaveTextContent('/appointments');
    });
  });
});
