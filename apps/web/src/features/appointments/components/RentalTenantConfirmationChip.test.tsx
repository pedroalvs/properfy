import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RentalTenantConfirmationStatus } from '@properfy/shared';
import { RentalTenantConfirmationChip } from './RentalTenantConfirmationChip';

const STATUS_LABELS: Record<RentalTenantConfirmationStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  UNAVAILABLE: 'Unavailable',
  NO_RESPONSE: 'No Response',
};

describe('RentalTenantConfirmationChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<RentalTenantConfirmationChip status={status as RentalTenantConfirmationStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through to StatusChip', () => {
    render(
      <RentalTenantConfirmationChip status={RentalTenantConfirmationStatus.PENDING} className="my-custom" />,
    );
    const chip = screen.getByText('Pending');
    expect(chip.className).toContain('my-custom');
  });
});
