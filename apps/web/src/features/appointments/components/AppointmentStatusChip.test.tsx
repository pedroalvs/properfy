import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppointmentStatus } from '@properfy/shared';
import { AppointmentStatusChip } from './AppointmentStatusChip';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_INSPECTOR: 'Awaiting Inspector',
  SCHEDULED: 'Scheduled',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
  DONE: 'Done (Review Required)',
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
    const chip = screen.getByText('Draft');
    expect(chip.className).toContain('my-custom');
  });

  it('renders reviewed DONE label when cross-check exists', () => {
    render(
      <AppointmentStatusChip
        status={AppointmentStatus.DONE}
        doneCheckedByUserId="user-123"
      />,
    );
    expect(screen.getByText('Done (Review)')).toBeInTheDocument();
  });
});
