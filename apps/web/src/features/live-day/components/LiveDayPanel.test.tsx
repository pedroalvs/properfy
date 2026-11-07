import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RouteEtaAccuracy } from '@properfy/shared';
import { makeInspector, makeLiveDayResponse } from '../test-support/fixtures';
import { LiveDayPanel } from './LiveDayPanel';

// The locked-time tab has its own test; here we only assert it mounts and gets today.
vi.mock('./LockedTimeSection', () => ({
  LockedTimeSection: ({ today }: { today: string }) => (
    <div data-testid="locked-time-section">locked:{today}</div>
  ),
}));

const ETA: RouteEtaAccuracy = {
  days: 30,
  sampleSize: 214,
  excludedOutliers: 0,
  meanAbsoluteErrorMinutes: 6.2,
  thresholdMinutes: 10,
  minSampleSize: 30,
  status: 'OK',
} as RouteEtaAccuracy;

function renderPanel(overrides: Record<string, unknown> = {}) {
  const props = {
    data: makeLiveDayResponse({ today: '2026-11-05' }),
    visibleInspectors: [makeInspector()],
    selectedInspector: null,
    needsAttention: false,
    showAll: false,
    canShowAll: true,
    isLive: true,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    pollError: false,
    redirectNotice: null,
    eta: { accuracy: ETA, isLoading: false, isError: false },
    detailHeadingRef: createRef<HTMLHeadingElement>(),
    activeTab: 'inspectors' as const,
    onDateChange: vi.fn(),
    onToday: vi.fn(),
    onToggleAttention: vi.fn(),
    onToggleShowAll: vi.fn(),
    onSelect: vi.fn(),
    onBack: vi.fn(),
    onRetry: vi.fn(),
    onShowEveryone: vi.fn(),
    onInteractingChange: vi.fn(),
    onTabChange: vi.fn(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={client}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <LiveDayPanel {...(props as any)} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LiveDayPanel tabs', () => {
  it('renders an Inspectors tab (default) and a Locked time tab', () => {
    renderPanel();
    expect(screen.getByRole('tab', { name: 'Inspectors' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Locked time' })).toBeInTheDocument();
  });

  it('shows the inspector list on the Inspectors tab, not the locked section', () => {
    renderPanel({ activeTab: 'inspectors' });
    expect(screen.getByRole('list', { name: 'Inspectors' })).toBeInTheDocument();
    expect(screen.queryByTestId('locked-time-section')).not.toBeInTheDocument();
  });

  it('shows the locked section (with data.today) on the Locked time tab and hides the list', () => {
    renderPanel({ activeTab: 'locked' });
    const locked = screen.getByTestId('locked-time-section');
    expect(locked).toHaveTextContent('locked:2026-11-05');
    expect(screen.queryByRole('list', { name: 'Inspectors' })).not.toBeInTheDocument();
  });

  it('calls onTabChange when a tab is clicked', () => {
    const { onTabChange } = renderPanel({ activeTab: 'inspectors' });
    fireEvent.click(screen.getByRole('tab', { name: 'Locked time' }));
    expect(onTabChange).toHaveBeenCalledWith('locked');
  });

  it('keeps the Route ETA accuracy footer visible on both tabs', () => {
    renderPanel({ activeTab: 'inspectors' });
    expect(screen.getByTestId('route-eta-accuracy')).toBeInTheDocument();
  });

  it('keeps the Route ETA accuracy footer visible on the Locked time tab', () => {
    renderPanel({ activeTab: 'locked' });
    expect(screen.getByTestId('route-eta-accuracy')).toBeInTheDocument();
  });

  it('keeps the selected inspector detail when on the Inspectors tab', () => {
    const selected = makeInspector({ inspectorId: 'insp-1', inspectorName: 'Jane Doe' });
    renderPanel({ activeTab: 'inspectors', selectedInspector: selected, visibleInspectors: [selected] });
    expect(screen.getByRole('heading', { level: 2, name: /Jane Doe/ })).toBeInTheDocument();
  });
});
