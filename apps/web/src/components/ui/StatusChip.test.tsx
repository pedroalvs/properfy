import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders the correct label for DRAFT', () => {
    render(<StatusChip status={AppointmentStatus.DRAFT} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders the correct label for DONE', () => {
    render(<StatusChip status={AppointmentStatus.DONE} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('applies background color from status map', () => {
    render(<StatusChip status={AppointmentStatus.SCHEDULED} />);
    const chip = screen.getByText('Scheduled');
    expect(chip.style.backgroundColor).toBe('var(--color-status-scheduled)');
  });

  it('renders all 6 statuses', () => {
    const statuses = Object.values(AppointmentStatus) as AppointmentStatus[];
    const { container } = render(
      <>
        {statuses.map((s) => (
          <StatusChip key={s} status={s} />
        ))}
      </>,
    );
    expect(container.querySelectorAll('span')).toHaveLength(6);
  });

  it('renders with custom label and bg props', () => {
    render(<StatusChip label="Custom Status" bg="#FF0000" />);
    const chip = screen.getByText('Custom Status');
    expect(chip).toBeInTheDocument();
    expect(chip.style.backgroundColor).toBeTruthy();
  });

  it('applies text-primary color for custom chips', () => {
    render(<StatusChip label="Test" bg="#00FF00" />);
    const chip = screen.getByText('Test');
    expect(chip.style.color).toBe('var(--color-text-primary)');
  });
});
