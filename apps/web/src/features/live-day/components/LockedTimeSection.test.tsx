import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { LockedTimeResponse } from '@properfy/shared';
import { lockedTimeRange } from '../lib/lockedTimeView';
import { LockedTimeSection } from './LockedTimeSection';
import type { UseLockedTimeReturn } from '../hooks/useLockedTime';

const useLockedTimeMock = vi.fn<[string, number], UseLockedTimeReturn>();
vi.mock('../hooks/useLockedTime', () => ({
  useLockedTime: (today: string, period: number) => useLockedTimeMock(today, period),
}));

const TODAY = '2026-11-05';

const DATA: LockedTimeResponse = {
  from: '2026-11-05',
  to: '2026-11-18',
  generatedAt: '2026-11-05T00:00:00.000Z',
  overall: { confirmed: 2, required: 3, percent: 66.7 },
  byAgency: [
    { tenantId: 't1', agencyName: 'Ray White', confirmed: 2, required: 3, percent: 66.7 },
    { tenantId: 't2', agencyName: 'Belle Property', confirmed: 1, required: 4, percent: 25 },
  ],
  byRegion: [
    { regionId: 'r1', regionName: 'North', agencyName: 'Ray White', confirmed: 2, required: 3, percent: 66.7 },
    { regionId: 'r2', regionName: 'South', agencyName: null, confirmed: 1, required: 2, percent: 50 },
    { regionId: null, regionName: 'No region', agencyName: null, confirmed: 0, required: 1, percent: 0 },
  ],
};

function setHook(partial: Partial<UseLockedTimeReturn> = {}) {
  useLockedTimeMock.mockImplementation((today, period) => ({
    data: DATA,
    range: lockedTimeRange(today, period),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...partial,
  }));
}

beforeEach(() => {
  useLockedTimeMock.mockReset();
});

describe('LockedTimeSection', () => {
  it('shows a two-table skeleton while loading', () => {
    setHook({ data: null, isLoading: true });
    render(<LockedTimeSection today={TODAY} />);
    expect(screen.getByTestId('locked-time-skeleton')).toBeInTheDocument();
  });

  it('shows the error state with a retry action', () => {
    const refetch = vi.fn();
    setHook({ data: null, isError: true, refetch });
    render(<LockedTimeSection today={TODAY} />);
    expect(screen.getByText("We couldn't load locked time.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows the empty state when nothing requires confirmation in the period', () => {
    setHook({
      data: {
        ...DATA,
        overall: { confirmed: 0, required: 0, percent: null },
        byAgency: [],
        byRegion: [],
      },
    });
    render(<LockedTimeSection today={TODAY} />);
    expect(
      screen.getByText('No inspections need tenant confirmation in this period.'),
    ).toBeInTheDocument();
  });

  it('renders the title, help, overall summary with a meter, and both tables', () => {
    setHook();
    render(<LockedTimeSection today={TODAY} />);

    expect(screen.getByRole('heading', { name: 'Locked time' })).toBeInTheDocument();
    expect(
      screen.getByText('Share of inspections that need the tenant to confirm and are already confirmed.'),
    ).toBeInTheDocument();

    expect(screen.getByText('Overall: 66.7% locked (2 of 3)')).toBeInTheDocument();
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '66.7');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');

    expect(screen.getByText('By agency')).toBeInTheDocument();
    expect(screen.getByText('By region')).toBeInTheDocument();

    const agencyTable = screen.getByRole('table', { name: 'By agency' });
    expect(within(agencyTable).getByText('Agency')).toBeInTheDocument();
    expect(within(agencyTable).getByText('Confirmed / Required')).toBeInTheDocument();
    expect(within(agencyTable).getByText('Ray White')).toBeInTheDocument();

    const regionTable = screen.getByRole('table', { name: 'By region' });
    expect(within(regionTable).getByText('Region')).toBeInTheDocument();
  });

  it('labels regions with the owning agency, Platform, or no suffix (L-F05-13)', () => {
    setHook();
    render(<LockedTimeSection today={TODAY} />);
    const regionTable = screen.getByRole('table', { name: 'By region' });
    expect(within(regionTable).getByText('North · Ray White')).toBeInTheDocument();
    expect(within(regionTable).getByText('South · Platform')).toBeInTheDocument();
    expect(within(regionTable).getByText('No region')).toBeInTheDocument();
  });

  it('renders a null percent as "—" with an explanatory aria-label', () => {
    setHook({
      data: {
        ...DATA,
        byRegion: [
          { regionId: 'r9', regionName: 'West', agencyName: 'Ray White', confirmed: 0, required: 0, percent: null },
          ...DATA.byRegion,
        ],
      },
    });
    render(<LockedTimeSection today={TODAY} />);
    expect(screen.getByLabelText('No inspections need confirmation')).toHaveTextContent('—');
  });

  it('keeps the "No region" row last when sorting Locked ascending and descending', () => {
    setHook();
    render(<LockedTimeSection today={TODAY} />);
    const regionTable = screen.getByRole('table', { name: 'By region' });
    const sortButton = within(regionTable).getByRole('button', { name: /Locked/ });
    const lockedHeader = within(regionTable).getByRole('columnheader', { name: /Locked/ });

    // Ascending
    fireEvent.click(sortButton);
    expect(lockedHeader).toHaveAttribute('aria-sort', 'ascending');
    let bodyRows = within(regionTable).getAllByRole('row').slice(1); // drop header row
    expect(within(bodyRows[bodyRows.length - 1]!).getByText('No region')).toBeInTheDocument();

    // Descending
    fireEvent.click(sortButton);
    expect(lockedHeader).toHaveAttribute('aria-sort', 'descending');
    bodyRows = within(regionTable).getAllByRole('row').slice(1);
    expect(within(bodyRows[bodyRows.length - 1]!).getByText('No region')).toBeInTheDocument();
  });

  it('offers 7/14/30 periods (default 14), shows the civil range, and re-queries on change (L-F05-09)', () => {
    setHook();
    render(<LockedTimeSection today={TODAY} />);

    // Default range subtitle, anchored on today.
    expect(screen.getByText('5 Nov – 18 Nov')).toBeInTheDocument();
    expect(useLockedTimeMock).toHaveBeenCalledWith(TODAY, 14);

    // Switch to "Next 30 days".
    fireEvent.click(screen.getByRole('button', { name: 'Period' }));
    fireEvent.click(screen.getByText('Next 30 days'));
    expect(useLockedTimeMock).toHaveBeenCalledWith(TODAY, 30);
  });
});
