import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';
import { ReliabilityDrawer } from './ReliabilityDrawer';
import { anaDetailFixture, carlaDetailFixture, makeDetail, makeMetric, INSPECTOR_IDS } from '../__fixtures__/reliability';
import type { UseInspectorReliabilityReturn } from '../hooks/useInspectorReliability';

const mockHook = vi.fn<[], UseInspectorReliabilityReturn>();
vi.mock('../hooks/useInspectorReliability', () => ({
  useInspectorReliability: () => mockHook(),
}));

// Stub the clock-dependent banners; their copy is unit-tested in FreshnessBanners.test.
vi.mock('./FreshnessBanners', () => ({
  FreshnessBanners: (props: { isStale: boolean }) => <div data-testid="freshness" data-stale={String(props.isStale)} />,
}));

function setHook(partial: Partial<UseInspectorReliabilityReturn>) {
  mockHook.mockReturnValue({
    inspector: null,
    isLoading: false,
    isError: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
    ...partial,
  });
}

beforeEach(() => mockHook.mockReset());

function renderDrawer(inspectorId: string | null = INSPECTOR_IDS.ana) {
  return render(<ReliabilityDrawer inspectorId={inspectorId} onClose={vi.fn()} />, {
    wrapper: createRouterQueryWrapper(),
  });
}

describe('ReliabilityDrawer', () => {
  it('shows a skeleton while loading', () => {
    setHook({ isLoading: true });
    renderDrawer();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Punctuality')).not.toBeInTheDocument();
  });

  it('shows a load error with retry', () => {
    const refetch = vi.fn();
    setHook({ isError: true, refetch });
    renderDrawer();
    expect(screen.getByText("We couldn't load this inspector's metrics.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows a not-found message for an unknown inspector', () => {
    setHook({ isError: true, isNotFound: true });
    renderDrawer();
    expect(screen.getByText("We couldn't find this inspector.")).toBeInTheDocument();
  });

  it('renders a SCORED inspector header, the eight metrics and the footer', () => {
    setHook({ inspector: anaDetailFixture });
    renderDrawer();
    expect(screen.getByText('88.3')).toBeInTheDocument();
    expect(screen.getByText('Rank 4 of 5')).toBeInTheDocument();
    expect(screen.getByText('12 services · last 30 days')).toBeInTheDocument();
    for (const label of ['Punctuality', 'On-site check-ins', 'Finished within 6 hours', 'Tenant satisfaction', 'Late notice given', 'Attendance', 'Completed volume', 'Accepted work']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Percentages are weighted by service duration and planned travel.')).toBeInTheDocument();
  });

  it('shows an Inactive badge and hides the rank for an inactive inspector', () => {
    setHook({ inspector: makeDetail({ inspectorStatus: 'INACTIVE' }) });
    renderDrawer();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.queryByText(/Rank \d/)).not.toBeInTheDocument();
  });

  it('shows the insufficient-volume header with metrics listed', () => {
    setHook({ inspector: carlaDetailFixture });
    renderDrawer(INSPECTOR_IDS.carla);
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByText('9 of 10 services needed to be ranked')).toBeInTheDocument();
    expect(screen.getByText('Punctuality')).toBeInTheDocument();
  });

  it('shows "No score yet" with no metric rows for NOT_COMPUTED', () => {
    setHook({ inspector: makeDetail({ status: 'NOT_COMPUTED', score: null, position: null, metrics: [] }) });
    renderDrawer();
    expect(screen.getByText('No score yet')).toBeInTheDocument();
    expect(screen.getByText('This inspector will be scored after the next nightly run.')).toBeInTheDocument();
    expect(screen.queryByText('Punctuality')).not.toBeInTheDocument();
  });

  it('wires the freshness banners with the response freshness fields', () => {
    setHook({ inspector: makeDetail({ isStale: true }) });
    renderDrawer();
    expect(screen.getByTestId('freshness')).toHaveAttribute('data-stale', 'true');
  });

  it('renders the no-show failure copy verbatim', () => {
    const metrics = anaDetailFixture.metrics.map((m) =>
      m.metric === 'CANT_ATTEND'
        ? makeMetric('CANT_ATTEND', {
            rate: 0.92,
            eligibleCount: 12,
            successCount: 11,
            failureCount: 1,
            failures: [{ appointmentId: '77777777-7777-4777-8777-777777777777', serviceDate: '2026-11-10', detail: "Rejected: inspector didn't attend" }],
          })
        : m,
    );
    setHook({ inspector: makeDetail({ metrics }) });
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 issue' }));
    expect(screen.getByText(/Rejected: inspector didn't attend/)).toBeInTheDocument();
  });

  it('does not fetch or render body content when closed', () => {
    setHook({});
    renderDrawer(null);
    expect(screen.queryByText('Punctuality')).not.toBeInTheDocument();
  });
});
