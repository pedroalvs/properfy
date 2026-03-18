import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    { id: 'apt-15', code: 'VST-015', status: 'SCHEDULED', contactName: 'Test', scheduledDate: '2026-04-01' },
    { id: 'apt-14', code: 'VST-014', status: 'DONE', contactName: 'Test', scheduledDate: '2026-03-31' },
    { id: 'apt-13', code: 'VST-013', status: 'SCHEDULED', contactName: 'Test', scheduledDate: '2026-03-30' },
    { id: 'apt-12', code: 'VST-012', status: 'DRAFT', contactName: 'Test', scheduledDate: '2026-03-29' },
    { id: 'apt-07', code: 'VST-007', status: 'DONE', contactName: 'Test', scheduledDate: '2026-03-28' },
  ],
  pendingActions: {
    noResponseTenants: 2,
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
});
