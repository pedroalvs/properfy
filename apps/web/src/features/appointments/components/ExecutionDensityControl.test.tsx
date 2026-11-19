import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { UseExecutionDensityReturn } from '../hooks/useExecutionDensity';

// Capture what the (mocked) layer receives.
let densityProps: { map: unknown; cells: unknown[]; visible: boolean } | null = null;
vi.mock('@/components/map/DensityLayer', () => ({
  DensityLayer: (props: { map: unknown; cells: unknown[]; visible: boolean }) => {
    densityProps = props;
    return null;
  },
  DENSITY_HEATMAP_RAMP: [0, 'hsla(199, 54%, 28%, 0)', 1, 'hsla(199, 54%, 28%, 0.95)'],
}));

vi.mock('../hooks/useExecutionDensity', () => ({ useExecutionDensity: vi.fn() }));

import { useExecutionDensity } from '../hooks/useExecutionDensity';
import { ExecutionDensityControl } from './ExecutionDensityControl';

const mockHook = useExecutionDensity as unknown as ReturnType<typeof vi.fn>;

const THREE_CELLS = [
  { lat: -33.8685, lng: 151.2095, count: 7 },
  { lat: -33.8695, lng: 151.2105, count: 3 },
  { lat: -33.87, lng: 151.21, count: 2 },
];

function makeReturn(over: Partial<UseExecutionDensityReturn> = {}): UseExecutionDensityReturn {
  return {
    cells: THREE_CELLS,
    totalExecutions: 7,
    cellCount: 3,
    excludedWithoutCoordinates: 0,
    truncated: false,
    minCellCount: 1,
    errorReason: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
    ...over,
  };
}

/** Params passed to the hook on the latest render. */
function lastHookParams() {
  return mockHook.mock.calls[mockHook.mock.calls.length - 1]![0];
}

const fakeMap = {} as never;

function renderControl(props: Partial<React.ComponentProps<typeof ExecutionDensityControl>> = {}) {
  return render(
    <ExecutionDensityControl
      map={fakeMap}
      isGlobalRole
      tenantId=""
      inspectorId=""
      {...props}
    />,
  );
}

function enable() {
  fireEvent.click(screen.getByRole('button', { name: 'Activity density' }));
}

beforeEach(() => {
  densityProps = null;
  mockHook.mockReset();
  mockHook.mockReturnValue(makeReturn());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-03T14:30:00Z')); // Sydney 2026-11-04
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ExecutionDensityControl — AM/OP', () => {
  it('C1: initial render — toggle unpressed, no panel, hook disabled', () => {
    renderControl();
    const btn = screen.getByRole('button', { name: 'Activity density' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('region', { name: 'Activity density' })).toBeNull();
    expect(lastHookParams().enabled).toBe(false);
  });

  it('C2: enabling opens the panel with Last 30 days selected and the 30-day period', () => {
    renderControl();
    enable();
    const btn = screen.getByRole('button', { name: 'Activity density' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    const region = screen.getByRole('region', { name: 'Activity density' });
    expect(within(region).getByRole('tab', { name: 'Last 30 days' })).toHaveAttribute('aria-selected', 'true');
    expect(lastHookParams()).toMatchObject({ enabled: true, fromDate: '2026-10-06', toDate: '2026-11-04' });
  });

  it('C3: selecting Last 7 days requests the 7-day period', () => {
    renderControl();
    enable();
    fireEvent.click(screen.getByRole('tab', { name: 'Last 7 days' }));
    expect(lastHookParams()).toMatchObject({ fromDate: '2026-10-29', toDate: '2026-11-04' });
  });

  it('C4: Custom shows a date range prefilled with the period; invalid end shows an alert and does not change the period', () => {
    renderControl();
    enable();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByText('Check-in dates')).toBeInTheDocument();
    const textboxes = screen.getAllByRole('textbox');
    const startInput = textboxes[0]!;
    const endInput = textboxes[1]!;
    // Prefilled with the 30-day range in dd/mm/yyyy.
    expect(startInput).toHaveValue('06/10/2026');
    expect(endInput).toHaveValue('04/11/2026');
    // End before the (unchanged) start → invalid immediately, no intermediate valid state.
    fireEvent.change(endInput, { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after the start date.');
    expect(lastHookParams()).toMatchObject({ fromDate: '2026-10-06', toDate: '2026-11-04' });
  });

  it('C5: passes tenantId and inspectorId; clearing inspector drops it', () => {
    const { rerender } = renderControl({ tenantId: 'T1', inspectorId: 'I1' });
    enable();
    expect(lastHookParams()).toMatchObject({ tenantId: 'T1', inspectorId: 'I1' });
    rerender(<ExecutionDensityControl map={fakeMap} isGlobalRole tenantId="T1" inspectorId="" />);
    expect(lastHookParams().inspectorId).toBeUndefined();
  });

  it('C7: scope line reflects the active agency/inspector filters', () => {
    const SUFFIX = "Other map filters (status, branch, service, dates) don’t apply.";
    const cases: Array<[Partial<React.ComponentProps<typeof ExecutionDensityControl>>, string]> = [
      [{}, 'All agencies'],
      [{ tenantId: 'T1' }, 'Filtered by agency'],
      [{ inspectorId: 'I1' }, 'Filtered by inspector'],
      [{ tenantId: 'T1', inspectorId: 'I1' }, 'Filtered by agency and inspector'],
    ];
    for (const [props, prefix] of cases) {
      const { unmount } = renderControl(props);
      enable();
      expect(screen.getByText(`${prefix}. ${SUFFIX}`)).toBeInTheDocument();
      unmount();
    }
  });

  it('C8: loading shows a polite status and the toggle stays clickable', () => {
    mockHook.mockReturnValue(makeReturn({ isLoading: true, cells: [], cellCount: 0 }));
    renderControl();
    enable();
    expect(screen.getByText('Loading activity…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity density' })).toBeEnabled();
  });

  it('C9 + C9b: summary counts and a numbered relative legend', () => {
    mockHook.mockReturnValue(
      makeReturn({ cells: [{ lat: 1, lng: 1, count: 12 }], cellCount: 3, totalExecutions: 7 }),
    );
    const { rerender } = renderControl();
    enable();
    expect(screen.getByText('7 check-ins · 3 areas')).toBeInTheDocument();
    expect(screen.getByText('Colour is relative to the busiest area in this view.')).toBeInTheDocument();
    const legend = screen.getByTestId('density-legend');
    expect(within(legend).getByText('1')).toBeInTheDocument();
    expect(within(legend).getByText('12')).toBeInTheDocument();

    mockHook.mockReturnValue(makeReturn({ cells: [{ lat: 1, lng: 1, count: 1250 }], cellCount: 1 }));
    rerender(<ExecutionDensityControl map={fakeMap} isGlobalRole tenantId="" inspectorId="" />);
    expect(within(screen.getByTestId('density-legend')).getByText('1,250')).toBeInTheDocument();

    mockHook.mockReturnValue(makeReturn({ cells: [{ lat: 1, lng: 1, count: 1 }], cellCount: 1 }));
    rerender(<ExecutionDensityControl map={fakeMap} isGlobalRole tenantId="" inspectorId="" />);
    const legend1 = screen.getByTestId('density-legend');
    expect(within(legend1).getAllByText('1')).toHaveLength(1);
  });

  it('C10: empty period hides the legend and shows the empty message', () => {
    mockHook.mockReturnValue(makeReturn({ cells: [], cellCount: 0, totalExecutions: 0 }));
    renderControl();
    enable();
    expect(screen.getByText('No check-ins in this period.')).toBeInTheDocument();
    expect(screen.queryByTestId('density-legend')).toBeNull();
  });

  it('C11: shows the without-location count', () => {
    mockHook.mockReturnValue(makeReturn({ excludedWithoutCoordinates: 2 }));
    renderControl();
    enable();
    expect(screen.getByText('2 check-ins without a location')).toBeInTheDocument();
  });

  it('C11c: AM (minCellCount 1) shows no privacy line', () => {
    renderControl();
    enable();
    expect(screen.queryByText(/hidden for privacy/)).toBeNull();
  });

  it('C12: shows the truncation notice', () => {
    mockHook.mockReturnValue(makeReturn({ truncated: true }));
    renderControl();
    enable();
    expect(screen.getByText('Showing the 5,000 busiest areas.')).toBeInTheDocument();
  });

  it('C13: error empties the layer, hides legend, shows Retry, no stale numbers', () => {
    const refetch = vi.fn();
    mockHook.mockReturnValue(
      makeReturn({ isError: true, cells: [], cellCount: 0, totalExecutions: 0, refetch }),
    );
    renderControl();
    enable();
    expect(screen.getByText('Couldn’t load activity density.')).toBeInTheDocument();
    expect(screen.queryByText(/check-ins · /)).toBeNull();
    expect(screen.queryByTestId('density-legend')).toBeNull();
    expect(densityProps).toMatchObject({ cells: [], visible: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('C14: toggling off hides the panel and disables the layer', () => {
    renderControl();
    enable();
    expect(screen.getByRole('region', { name: 'Activity density' })).toBeInTheDocument();
    enable(); // click again = turn off
    expect(screen.queryByRole('region', { name: 'Activity density' })).toBeNull();
    expect(densityProps).toMatchObject({ visible: false });
    expect(lastHookParams().enabled).toBe(false);
  });

  it('C16: Escape closes the panel and keeps the layer on, returning focus to the toggle', () => {
    renderControl();
    enable();
    const region = screen.getByRole('region', { name: 'Activity density' });
    fireEvent.keyDown(region, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Activity density' })).toBeNull();
    const btn = screen.getByRole('button', { name: 'Activity density' });
    expect(btn).toHaveAttribute('aria-pressed', 'true'); // still on
    expect(btn).toHaveFocus();
    expect(densityProps).toMatchObject({ visible: true });
  });

  it('C16b: the × button closes only the panel (layer stays on)', () => {
    renderControl();
    enable();
    fireEvent.click(screen.getByRole('button', { name: 'Close activity density panel' }));
    expect(screen.queryByRole('region', { name: 'Activity density' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Activity density' })).toHaveAttribute('aria-pressed', 'true');
    expect(densityProps).toMatchObject({ visible: true });
  });

  it('C17: re-enabling after a day rollover recomputes the period', () => {
    renderControl();
    enable();
    expect(lastHookParams()).toMatchObject({ fromDate: '2026-10-06', toDate: '2026-11-04' });
    enable(); // off
    act(() => {
      vi.setSystemTime(new Date('2026-11-04T14:30:00Z')); // Sydney 2026-11-05
    });
    enable(); // on again
    expect(lastHookParams()).toMatchObject({ fromDate: '2026-10-07', toDate: '2026-11-05' });
  });
});

describe('ExecutionDensityControl — CL (agency account)', () => {
  const clProps = { isGlobalRole: false };

  it('C4a: only three presets, no Custom and no date range', () => {
    renderControl(clProps);
    enable();
    const region = screen.getByRole('region', { name: 'Activity density' });
    expect(within(region).getByRole('tab', { name: 'Last 7 days' })).toBeInTheDocument();
    expect(within(region).getByRole('tab', { name: 'Last 30 days' })).toBeInTheDocument();
    expect(within(region).getByRole('tab', { name: 'Last 90 days' })).toBeInTheDocument();
    expect(within(region).queryByRole('tab', { name: 'Custom' })).toBeNull();
  });

  it('C6: discards tenantId/inspectorId and shows the agency scope line', () => {
    renderControl({ ...clProps, tenantId: 'T1', inspectorId: 'I1' });
    enable();
    expect(lastHookParams().tenantId).toBeUndefined();
    expect(lastHookParams().inspectorId).toBeUndefined();
    expect(
      screen.getByText('Your agency’s inspections only. Other map filters don’t apply.'),
    ).toBeInTheDocument();
  });

  it('C11a: shows the privacy line from the response minCellCount', () => {
    mockHook.mockReturnValue(makeReturn({ minCellCount: 3 }));
    renderControl(clProps);
    enable();
    expect(
      screen.getByText('Areas with fewer than 3 check-ins are hidden for privacy.'),
    ).toBeInTheDocument();
  });

  it('C11b: empty cells with a positive total suggests a longer period', () => {
    mockHook.mockReturnValue(
      makeReturn({ cells: [], cellCount: 0, totalExecutions: 4, minCellCount: 3 }),
    );
    renderControl(clProps);
    enable();
    expect(
      screen.getByText('No area has 3 or more check-ins in this period. Try a longer period.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('density-legend')).toBeNull();
  });

  it('C4b: re-anchors once on PERIOD_NOT_A_PRESET after a day rollover, then stops', () => {
    // Start healthy at Sydney 2026-11-04.
    mockHook.mockReturnValue(makeReturn());
    const { rerender } = renderControl(clProps);
    enable();
    expect(lastHookParams().toDate).toBe('2026-11-04');

    // The Sydney day rolls over; the next refetch with the stale period is rejected.
    act(() => {
      vi.setSystemTime(new Date('2026-11-04T14:30:00Z')); // Sydney 2026-11-05
    });
    mockHook.mockReturnValue(
      makeReturn({ isError: true, errorReason: 'PERIOD_NOT_A_PRESET', cells: [], cellCount: 0 }),
    );
    const callsBefore = mockHook.mock.calls.length;
    rerender(<ExecutionDensityControl map={fakeMap} isGlobalRole={false} tenantId="" inspectorId="" />);

    // The re-anchor effect recomputed the period to end on the new today, once.
    expect(lastHookParams().toDate).toBe('2026-11-05');
    expect(mockHook.mock.calls.length).toBeGreaterThan(callsBefore);

    // Still failing → no second automatic retry; the error state stands.
    rerender(<ExecutionDensityControl map={fakeMap} isGlobalRole={false} tenantId="" inspectorId="" />);
    expect(lastHookParams().toDate).toBe('2026-11-05'); // not re-anchored again
    expect(screen.getByText('Couldn’t load activity density.')).toBeInTheDocument();
  });
});
