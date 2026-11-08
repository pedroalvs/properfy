import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSearchParams } from 'react-router-dom';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';
import { InspectorPerformancePage } from './InspectorPerformancePage';
import { rankingFixture, anaDetailFixture, INSPECTOR_IDS } from '../__fixtures__/reliability';
import type { UseReliabilityRankingReturn } from '../hooks/useReliabilityRanking';
import type { UseInspectorReliabilityReturn } from '../hooks/useInspectorReliability';

const mockRanking = vi.fn<[], UseReliabilityRankingReturn>();
vi.mock('../hooks/useReliabilityRanking', () => ({ useReliabilityRanking: () => mockRanking() }));

const mockInspector = vi.fn<[], UseInspectorReliabilityReturn>();
vi.mock('../hooks/useInspectorReliability', () => ({ useInspectorReliability: () => mockInspector() }));

const NINE_AM_SYD = new Date('2026-12-01T22:00:00Z');
const HALF_FOUR_AM_SYD = new Date('2026-12-01T17:30:00Z');

function setRanking(partial: Partial<UseReliabilityRankingReturn>) {
  mockRanking.mockReturnValue({ ranking: null, isLoading: false, isError: false, refetch: vi.fn(), ...partial });
}

function InspectorParamProbe() {
  const [params] = useSearchParams();
  return <span data-testid="inspector-param">{params.get('inspector') ?? ''}</span>;
}

function renderPage(initialPath = '/inspector-performance') {
  return render(
    <>
      <InspectorPerformancePage />
      <InspectorParamProbe />
    </>,
    { wrapper: createRouterQueryWrapper(initialPath) },
  );
}

beforeEach(() => {
  mockRanking.mockReset();
  mockInspector.mockReset();
  mockInspector.mockReturnValue({
    inspector: anaDetailFixture,
    isLoading: false,
    isError: false,
    error: null,
    isNotFound: false,
    refetch: vi.fn(),
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NINE_AM_SYD);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InspectorPerformancePage — states', () => {
  it('shows a labelled loading state', () => {
    setRanking({ isLoading: true });
    renderPage();
    expect(screen.getByText('Loading inspector performance')).toBeInTheDocument();
  });

  it('shows a retryable error state', () => {
    const refetch = vi.fn();
    setRanking({ isError: true, refetch });
    renderPage();
    expect(screen.getByText("We couldn't load inspector performance.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when no snapshot exists', () => {
    setRanking({
      ranking: {
        ...rankingFixture,
        snapshotDate: null,
        windowFrom: null,
        windowTo: null,
        computedAt: null,
        isStale: false,
        ranked: [],
        notEnoughData: [],
      },
    });
    renderPage();
    expect(screen.getByText('No scores yet')).toBeInTheDocument();
  });
});

describe('InspectorPerformancePage — ranking', () => {
  it('renders the header, subtitle, privacy banner and five ranked rows', () => {
    setRanking({ ranking: rankingFixture });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Inspector performance' })).toBeInTheDocument();
    expect(
      screen.getByText('Last 30 days · 1 Nov – 30 Nov 2026 · Updated 1 Dec 2026, 4:15 am'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Only operations staff can see this page. Agencies never see scores or rankings.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Eva Martins details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Ben Lima details' })).toBeInTheDocument();
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Carla Nunes details' })).toHaveTextContent(
      'Carla Nunes · 9 of 10 services',
    );
  });

  it('exposes Configure weights as a link to the settings anchor', () => {
    setRanking({ ranking: rankingFixture });
    renderPage();
    expect(screen.getByRole('link', { name: 'Configure weights' })).toHaveAttribute(
      'href',
      '/platform-settings#reliability-index',
    );
  });

  it('shows only the not-enough-data message when nobody is ranked', () => {
    setRanking({
      ranking: {
        ...rankingFixture,
        ranked: [],
        notEnoughData: [{ inspectorId: INSPECTOR_IDS.carla, inspectorName: 'Carla Nunes', volume: 9, status: 'INSUFFICIENT_VOLUME' }],
      },
    });
    renderPage();
    expect(screen.getByText('No inspector has enough services to be ranked yet.')).toBeInTheDocument();
    expect(screen.getByText('Not enough data')).toBeInTheDocument();
  });
});

describe('InspectorPerformancePage — drawer', () => {
  // The drawer body (e.g. "Rank 4 of 5") only renders when actually open; the
  // DrawerPanel dialog element itself is always in the DOM, so asserting on body
  // content is the real open/closed signal.
  it('opens the drawer and sets ?inspector on row activation', () => {
    setRanking({ ranking: rankingFixture });
    renderPage();
    expect(screen.queryByText('Rank 4 of 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Ana Costa details' }));
    expect(screen.getByTestId('inspector-param').textContent).toBe(INSPECTOR_IDS.ana);
    expect(screen.getByRole('dialog', { name: 'Ana Costa reliability details' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Rank 4 of 5')).toBeInTheDocument();
  });

  it('opens the drawer directly from a deep link', () => {
    setRanking({ ranking: rankingFixture });
    renderPage(`/inspector-performance?inspector=${INSPECTOR_IDS.ana}`);
    expect(screen.getByText('Rank 4 of 5')).toBeInTheDocument();
  });

  it('treats an empty ?inspector= as closed (no stuck drawer body)', () => {
    setRanking({ ranking: rankingFixture });
    renderPage('/inspector-performance?inspector=');
    expect(screen.queryByText('Rank 4 of 5')).not.toBeInTheDocument();
  });

  it('closes on Escape, clears the param and restores focus to the row control', () => {
    setRanking({ ranking: rankingFixture });
    renderPage();
    const trigger = screen.getByRole('button', { name: 'Open Ana Costa details' });
    fireEvent.click(trigger);
    expect(screen.getByText('Rank 4 of 5')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-param').textContent).toBe(INSPECTOR_IDS.ana);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByTestId('inspector-param').textContent).toBe('');
    expect(screen.queryByText('Rank 4 of 5')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});

describe('InspectorPerformancePage — freshness (US5 wiring)', () => {
  it('shows the stale banner after 05:00 Sydney', () => {
    setRanking({ ranking: { ...rankingFixture, isStale: true, snapshotDate: '2026-12-01' } });
    renderPage();
    expect(
      screen.getByText(
        "Scores haven't been updated since 1 Dec 2026. The nightly job didn't finish; operations has been notified.",
      ),
    ).toBeInTheDocument();
  });

  it('suppresses the stale banner before 05:00 Sydney', () => {
    vi.setSystemTime(HALF_FOUR_AM_SYD);
    setRanking({ ranking: { ...rankingFixture, isStale: true, snapshotDate: '2026-12-01' } });
    renderPage();
    expect(screen.queryByText(/Scores haven't been updated since/)).not.toBeInTheDocument();
  });

  it('shows the pending-recompute banner', () => {
    vi.setSystemTime(new Date('2026-12-01T23:05:00.000Z'));
    setRanking({
      ranking: { ...rankingFixture, settingsUpdatedAt: '2026-12-01T23:00:00.000Z', computedAt: '2026-12-01T17:15:00.000Z' },
    });
    renderPage();
    expect(
      screen.getByText('Weights were changed at 10:00 am. Scores will update within a few minutes.'),
    ).toBeInTheDocument();
  });

  it('shows the overdue-recompute banner after 15 minutes', () => {
    vi.setSystemTime(new Date('2026-12-01T23:20:00.000Z'));
    setRanking({
      ranking: { ...rankingFixture, settingsUpdatedAt: '2026-12-01T23:00:00.000Z', computedAt: '2026-12-01T17:15:00.000Z' },
    });
    renderPage();
    expect(
      screen.getByText(
        "Weights were changed at 10:00 am but scores haven't been recalculated yet. Operations has been notified.",
      ),
    ).toBeInTheDocument();
  });

  it('shows no recompute banner once the recompute has run', () => {
    vi.setSystemTime(new Date('2026-12-01T23:30:00.000Z'));
    setRanking({
      ranking: { ...rankingFixture, settingsUpdatedAt: '2026-12-01T23:00:00.000Z', computedAt: '2026-12-01T23:01:00.000Z' },
    });
    renderPage();
    expect(screen.queryByText(/Weights were changed at/)).not.toBeInTheDocument();
  });
});
