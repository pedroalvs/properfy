import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DashboardAnalyticsResponse } from '@properfy/shared';
import { AvgExecutionBars } from './AvgExecutionBars';

type Row = DashboardAnalyticsResponse['avgExecutionMinutes'][number];

const row = (name: string, avgMinutes: number | null, sampleSize: number): Row => ({
  serviceTypeId: `id-${name}`,
  code: name.toUpperCase(),
  name,
  avgMinutes,
  sampleSize,
});

describe('AvgExecutionBars', () => {
  it('formats sub-hour durations in minutes', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Routine', 42, 120)]} />);
    expect(screen.getByText('42 min')).toBeInTheDocument();
  });

  it('formats durations past an hour in hours and minutes', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Outgoing', 95, 4)]} />);
    expect(screen.getByText('1 h 35 min')).toBeInTheDocument();
  });

  it('drops the trailing minutes on a whole hour', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Outgoing', 120, 4)]} />);
    expect(screen.getByText('2 h')).toBeInTheDocument();
  });

  it('discloses the sample size so a one-off average is not read as typical', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Routine', 42, 1)]} />);
    expect(screen.getByText('1 inspection')).toBeInTheDocument();
  });

  it('pluralises the sample size', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Routine', 42, 12)]} />);
    expect(screen.getByText('12 inspections')).toBeInTheDocument();
  });

  it('omits a service type with no finished execution', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Routine', 42, 12), row('Ingoing', null, 0)]} />);
    expect(screen.getByText('Routine')).toBeInTheDocument();
    expect(screen.queryByText('Ingoing')).not.toBeInTheDocument();
  });

  it('says so when nothing was executed at all', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[]} />);
    expect(screen.getByText(/no inspection finished in this period/i)).toBeInTheDocument();
  });

  it('offers a table view of the same rows', () => {
    render(<AvgExecutionBars avgExecutionMinutes={[row('Routine', 42, 120)]} />);
    fireEvent.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.getByRole('columnheader', { name: 'Sample' })).toBeInTheDocument();
  });
});
