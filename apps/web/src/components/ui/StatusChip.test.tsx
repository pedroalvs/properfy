import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from './StatusChip';

describe('StatusChip', () => {
  it('renders the correct label for DRAFT', () => {
    render(<StatusChip status={AppointmentStatus.DRAFT} />);
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
  });

  it('renders the correct label for DONE', () => {
    render(<StatusChip status={AppointmentStatus.DONE} />);
    expect(screen.getByText('Concluído')).toBeInTheDocument();
  });

  it('applies background color from status map', () => {
    render(<StatusChip status={AppointmentStatus.SCHEDULED} />);
    const chip = screen.getByText('Agendado');
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
});
