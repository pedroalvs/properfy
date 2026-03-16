import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { AppointmentStatusChip } from './AppointmentStatusChip';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  DRAFT: 'Rascunho',
  AWAITING_INSPECTOR: 'Aguardando Inspetor',
  SCHEDULED: 'Agendado',
  DONE: 'Concluído',
  CANCELLED: 'Cancelado',
  REJECTED: 'Rejeitado',
};

describe('AppointmentStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<AppointmentStatusChip status={status as AppointmentStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through to StatusChip', () => {
    render(
      <AppointmentStatusChip status={AppointmentStatus.DRAFT} className="my-custom" />,
    );
    const chip = screen.getByText('Rascunho');
    expect(chip.className).toContain('my-custom');
  });
});
