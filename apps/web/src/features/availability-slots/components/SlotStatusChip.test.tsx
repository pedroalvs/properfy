import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvailabilitySlotStatus } from '@properfy/shared';
import { SlotStatusChip } from './SlotStatusChip';

describe('SlotStatusChip', () => {
  it('renders Available status', () => {
    render(<SlotStatusChip status={AvailabilitySlotStatus.AVAILABLE} />);
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders Booked status', () => {
    render(<SlotStatusChip status={AvailabilitySlotStatus.BOOKED} />);
    expect(screen.getByText('Booked')).toBeInTheDocument();
  });

  it('renders Cancelled status', () => {
    render(<SlotStatusChip status={AvailabilitySlotStatus.CANCELLED} />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders unknown status as-is', () => {
    render(<SlotStatusChip status="UNKNOWN_STATUS" />);
    expect(screen.getByText('UNKNOWN_STATUS')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <SlotStatusChip status={AvailabilitySlotStatus.AVAILABLE} className="ml-2" />,
    );
    expect(container.firstChild).toHaveClass('ml-2');
  });

  it('applies correct background color for Available', () => {
    render(<SlotStatusChip status={AvailabilitySlotStatus.AVAILABLE} />);
    const chip = screen.getByText('Available');
    expect(chip).toHaveStyle({ backgroundColor: 'var(--color-status-done)' });
  });
});
