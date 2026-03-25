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

const MOCK_STATS = {
  appointmentsByStatus: {
    draft: 2,
    awaitingInspector: 3,
    scheduled: 4,
    doneThisMonth: 3,
  },
  recentAppointments: [
    { id: 'apt-15', code: 'VST-015', propertyAddress: 'Address 15', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-04-01' },
    { id: 'apt-14', code: 'VST-014', propertyAddress: 'Address 14', status: 'DONE', doneCheckedByUserId: null, scheduledDate: '2026-03-31' },
    { id: 'apt-13', code: 'VST-013', propertyAddress: 'Address 13', status: 'SCHEDULED', doneCheckedByUserId: null, scheduledDate: '2026-03-30' },
    { id: 'apt-12', code: 'VST-012', propertyAddress: 'Address 12', status: 'DRAFT', doneCheckedByUserId: null, scheduledDate: '2026-03-29' },
    { id: 'apt-07', code: 'VST-007', propertyAddress: 'Address 07', status: 'DONE', doneCheckedByUserId: 'op-1', scheduledDate: '2026-03-28' },
  ],
  pendingActions: {
    noResponseTenants: 2,
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
  mockGET.mockResolvedValue({ data: { data: MOCK_STATS }, error: undefined });
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
