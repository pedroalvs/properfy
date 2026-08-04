import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { AnalyticsPage } from './AnalyticsPage';

// The component resolves "today"/instants in the user's effective timezone;
// pin it to the platform default so these tests stay deterministic.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));


vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000', mapboxToken: 'pk.test' } }));

// The heatmap owns a Mapbox GL instance; jsdom has no WebGL. Its own behaviour
// (layer paint, centroid fit) is not what this suite is about.
vi.mock('../components/RegionHeatmap', () => ({
  RegionHeatmap: () => <div data-testid="region-heatmap-stub" />,
}));

const useAnalyticsMock = vi.fn();
const useAnalyticsHeatmapMock = vi.fn();
vi.mock('../hooks/useAnalytics', () => ({
  useAnalytics: (...args: unknown[]) => useAnalyticsMock(...args),
  useAnalyticsHeatmap: (...args: unknown[]) => useAnalyticsHeatmapMock(...args),
}));

const SERVICE_TYPE_ID = '11111111-1111-4111-8111-111111111111';

function makeAnalytics(overrides: Partial<DashboardAnalyticsResponse> = {}): DashboardAnalyticsResponse {
  return {
    period: { startDate: '2026-07-01', endDate: '2026-07-31', granularity: 'day' },
    kpis: { today: 12, thisWeek: 87, thisMonth: 341, inPeriod: 341, cancelledInPeriod: 19 },
    statusInPeriod: {
      DRAFT: 4,
      AWAITING_INSPECTOR: 21,
      SCHEDULED: 60,
      DONE: 237,
      CANCELLED: 19,
      REJECTED: 0,
    },
    confirmationRate: { confirmed: 156, eligible: 200 },
    revenue: { amount: 42180.5, currency: 'AUD' },
    evolution: [
      { bucketStart: '2026-07-01', count: 11 },
      { bucketStart: '2026-07-02', count: 14 },
    ],
    serviceTypeDistribution: [
      { serviceTypeId: SERVICE_TYPE_ID, code: 'ROUTINE', name: 'Routine Inspection', count: 180 },
    ],
    avgExecutionMinutes: [
      { serviceTypeId: SERVICE_TYPE_ID, code: 'ROUTINE', name: 'Routine Inspection', avgMinutes: 42, sampleSize: 120 },
    ],
    ...overrides,
  };
}

function renderPage(initialEntries = ['/analytics']) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAnalyticsMock.mockReturnValue({
    analytics: makeAnalytics(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useAnalyticsHeatmapMock.mockReturnValue({ heatmap: null, isLoading: false, isError: false });
});

describe('AnalyticsPage — states', () => {
  it('renders a skeleton while loading', () => {
    useAnalyticsMock.mockReturnValue({ analytics: null, isLoading: true, isError: false, refetch: vi.fn() });
    renderPage();
    expect(screen.queryByTestId('chart-card')).not.toBeInTheDocument();
  });

  it('offers a retry on error', () => {
    const refetch = vi.fn();
    useAnalyticsMock.mockReturnValue({ analytics: null, isLoading: false, isError: true, refetch });
    renderPage();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders every panel once data arrives', () => {
    renderPage();
    expect(screen.getByText('Service volume')).toBeInTheDocument();
    expect(screen.getByText('Tenant confirmation')).toBeInTheDocument();
    expect(screen.getByText('By service type')).toBeInTheDocument();
    expect(screen.getByText('Average execution time')).toBeInTheDocument();
    expect(screen.getByTestId('region-heatmap-stub')).toBeInTheDocument();
  });
});

describe('AnalyticsPage — revenue gating', () => {
  it('shows the revenue tile when the server returns a figure', () => {
    renderPage();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
  });

  it('omits the revenue tile entirely when the server returns null', () => {
    useAnalyticsMock.mockReturnValue({
      analytics: makeAnalytics({ revenue: null }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Absent, not zeroed — a CL_USER without view_financials must not read "$0".
    expect(screen.queryByText('Revenue')).not.toBeInTheDocument();
    expect(screen.getByText('In period')).toBeInTheDocument();
  });
});

describe('AnalyticsPage — period', () => {
  it('defaults to this month', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'This month' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reads the preset from the URL', () => {
    renderPage(['/analytics?preset=last-30']);
    expect(screen.getByRole('tab', { name: 'Last 30 days' })).toHaveAttribute('aria-selected', 'true');
  });

  it('requests the range carried in the URL for a custom period', () => {
    renderPage(['/analytics?preset=custom&startDate=2026-05-01&endDate=2026-05-31']);
    expect(useAnalyticsMock).toHaveBeenCalledWith(
      expect.objectContaining({ startDate: '2026-05-01', endDate: '2026-05-31' }),
    );
  });

  it('parks the query and prompts for dates when a custom range is half-entered', () => {
    renderPage(['/analytics?preset=custom&startDate=2026-05-01']);
    expect(useAnalyticsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    expect(screen.getByText(/pick a start and end date/i)).toBeInTheDocument();
  });

  it('parks the query when a custom range is inverted', () => {
    renderPage(['/analytics?preset=custom&startDate=2026-05-31&endDate=2026-05-01']);
    expect(useAnalyticsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it('exposes the date inputs only for a custom period', () => {
    // Queried by aria-label: FilterDateRange renders "Dates" as both the visible
    // label and inside each input's accessible name, so getByText would match twice.
    const { unmount } = renderPage();
    expect(screen.queryByLabelText('Dates - start')).not.toBeInTheDocument();
    unmount();

    renderPage(['/analytics?preset=custom&startDate=2026-05-01&endDate=2026-05-31']);
    expect(screen.getByLabelText('Dates - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Dates - end')).toBeInTheDocument();
  });
});
