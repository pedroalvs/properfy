import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleRunStatusChip } from './ScheduleRunStatusChip';

describe('ScheduleRunStatusChip', () => {
  it('renders completed with green "Completed" label', () => {
    render(<ScheduleRunStatusChip status="completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders failed with red "Failed" label', () => {
    render(<ScheduleRunStatusChip status="failed" />);
    const chip = screen.getByText('Failed');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-[#FFCDD2]');
  });

  it('renders skipped_catchup with gray label and descriptive text', () => {
    render(<ScheduleRunStatusChip status="skipped_catchup" />);
    expect(screen.getByText('Skipped (catch-up)')).toBeInTheDocument();
  });

  it('renders skipped_empty with gray label and descriptive text', () => {
    render(<ScheduleRunStatusChip status="skipped_empty" />);
    expect(screen.getByText('Skipped (empty)')).toBeInTheDocument();
  });

  it('renders queued and running states', () => {
    const { rerender } = render(<ScheduleRunStatusChip status="queued" />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
    rerender(<ScheduleRunStatusChip status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });
});
