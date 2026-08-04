import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InspectorWorkloadResponse } from '@properfy/shared';
import { InspectorWorkloadPage } from './InspectorWorkloadPage';

// The component resolves "today"/instants in the user's effective timezone;
// pin it to the platform default so these tests stay deterministic.
vi.mock('@/hooks/useEffectiveTimezone', () => ({
  useEffectiveTimezone: () => 'Australia/Sydney',
}));


const mockUseInspectorWorkload = vi.fn();
vi.mock('../hooks/useInspectorWorkload', () => ({
  useInspectorWorkload: (weekStart: string) => mockUseInspectorWorkload(weekStart),
}));

const ALICE = '11111111-1111-4111-8111-111111111111';

function makeWorkload(): InspectorWorkloadResponse {
  return {
    week: {
      weekStart: '2026-07-27',
      weekEnd: '2026-08-02',
      days: [
        '2026-07-27',
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
      ],
    },
    thresholds: { weeklyBusy: 15, weeklyOverloaded: 18, dailyBusy: 3, dailyOverloaded: 4 },
    kpis: {
      totalInWeek: 16,
      activeInspectorCount: 1,
      avgPerInspector: 16,
      nearLimit: { count: 1, inspectors: [{ inspectorId: ALICE, inspectorName: 'Alice', total: 16 }] },
      overloaded: { count: 0, inspectors: [] },
    },
    funnel: {
      previous: {
        weekStart: '2026-07-20',
        weekEnd: '2026-07-26',
        done: 12,
        scheduled: 12,
        confirmed: 12,
        confirmationEligible: 12,
      },
      selected: {
        weekStart: '2026-07-27',
        weekEnd: '2026-08-02',
        done: 4,
        scheduled: 16,
        confirmed: 14,
        confirmationEligible: 16,
      },
      next: {
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        done: 0,
        scheduled: 9,
        confirmed: 6,
        confirmationEligible: 9,
      },
    },
    completed: {
      doneSelectedWeek: 4,
      donePreviousWeek: 12,
      doneSelectedMonth: 40,
      donePreviousMonth: 38,
      selectedMonth: '2026-07',
      previousMonth: '2026-06',
    },
    matrix: {
      inspectors: [
        {
          inspectorId: ALICE,
          inspectorName: 'Alice',
          isActive: true,
          days: [3, 3, 3, 3, 2, 1, 1],
          total: 16,
          level: 'busy',
        },
      ],
      teamTotalsByDay: [3, 3, 3, 3, 2, 1, 1],
      teamTotal: 16,
    },
  };
}

function renderPage(url = '/inspector-workload?week=2026-07-27') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <InspectorWorkloadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseInspectorWorkload.mockReturnValue({
    workload: makeWorkload(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('InspectorWorkloadPage', () => {
  it('renders the header, selector and every panel', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Inspector Workload' })).toBeInTheDocument();
    expect(screen.getByTestId('week-selector')).toBeInTheDocument();
    expect(screen.getByText('Inspections per inspector')).toBeInTheDocument();
    expect(screen.getByText('Week on week')).toBeInTheDocument();
    expect(screen.getByText('Done in selected week')).toBeInTheDocument();
    expect(screen.getAllByTestId('workload-kpi')).toHaveLength(4);
  });

  it('queries the week taken from the URL', () => {
    renderPage('/inspector-workload?week=2026-08-03');

    expect(mockUseInspectorWorkload).toHaveBeenCalledWith('2026-08-03');
  });

  it('re-queries with the new week when the operator steps back', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Previous week' }));

    // `useUrlFilters` debounces its URL write by 300 ms, so the re-query is not
    // observable on the next tick.
    await waitFor(() => expect(mockUseInspectorWorkload).toHaveBeenLastCalledWith('2026-07-20'));
  });

  it('shows a loading placeholder rather than an empty screen', () => {
    mockUseInspectorWorkload.mockReturnValue({
      workload: null,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.queryByText('Inspections per inspector')).not.toBeInTheDocument();
  });

  it('offers a retry on error', async () => {
    const refetch = vi.fn();
    mockUseInspectorWorkload.mockReturnValue({
      workload: null,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText('Could not load inspector workload for this week.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
