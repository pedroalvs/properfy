import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { TenantConfirmationStatusChip } from './TenantConfirmationStatusChip';

const STATUS_LABELS: Record<TenantConfirmationStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  UNAVAILABLE: 'Unavailable',
  NO_RESPONSE: 'No Response',
};

describe('TenantConfirmationStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<TenantConfirmationStatusChip status={status as TenantConfirmationStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<TenantConfirmationStatusChip status={TenantConfirmationStatus.CONFIRMED} className="my-custom" />);
    const chip = screen.getByText('Confirmed');
    expect(chip.className).toContain('my-custom');
  });
});
