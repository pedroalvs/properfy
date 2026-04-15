import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScheduleStatusChip } from './ScheduleStatusChip';

describe('ScheduleStatusChip', () => {
  it('renders ACTIVE with green background and "Active" label', () => {
    render(<ScheduleStatusChip status="ACTIVE" />);
    const chip = screen.getByText('Active');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-[#C8E6C9]');
  });

  it('renders PAUSED with orange background and "Paused" label', () => {
    render(<ScheduleStatusChip status="PAUSED" />);
    const chip = screen.getByText('Paused');
    expect(chip).toBeInTheDocument();
    expect(chip.className).toContain('bg-[#FFE0B2]');
  });
});
