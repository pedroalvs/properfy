import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantConfirmationStatus } from '@properfy/shared';
import { TenantConfirmationChip } from './TenantConfirmationChip';

const STATUS_LABELS: Record<TenantConfirmationStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  UNAVAILABLE: 'Unavailable',
  NO_RESPONSE: 'No Response',
};

describe('TenantConfirmationChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<TenantConfirmationChip status={status as TenantConfirmationStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through to StatusChip', () => {
    render(
      <TenantConfirmationChip status={TenantConfirmationStatus.PENDING} className="my-custom" />,
    );
    const chip = screen.getByText('Pending');
    expect(chip.className).toContain('my-custom');
  });
});
