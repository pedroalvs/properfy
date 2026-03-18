import { render, screen } from '@testing-library/react';
import { StatusChip } from '../StatusChip';
import { AppointmentStatus } from '@properfy/shared';

describe('StatusChip', () => {
  it('renders label for appointment status', () => {
    render(<StatusChip status={AppointmentStatus.SCHEDULED} />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders correct background for DONE status', () => {
    render(<StatusChip status={AppointmentStatus.DONE} />);
    const chip = screen.getByText('Done');
    expect(chip.style.backgroundColor).toBe('var(--color-status-done)');
  });

  it('renders custom label and bg', () => {
    render(<StatusChip label="Custom" bg="#FF0000" />);
    const chip = screen.getByText('Custom');
    expect(chip.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('renders all appointment statuses without error', () => {
    const statuses = Object.values(AppointmentStatus);
    for (const status of statuses) {
      const { unmount, container } = render(<StatusChip status={status} />);
      const chip = container.querySelector('span');
      expect(chip).toBeInTheDocument();
      expect(chip?.textContent).toBeTruthy();
      unmount();
    }
  });
});
