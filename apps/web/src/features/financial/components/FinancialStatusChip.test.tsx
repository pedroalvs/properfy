import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialEntryStatus } from '@properfy/shared';
import { FinancialStatusChip } from './FinancialStatusChip';

const STATUS_LABELS: Record<FinancialEntryStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  CANCELLED: 'Cancelled',
  VOIDED: 'Voided',
};

describe('FinancialStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<FinancialStatusChip status={status as FinancialEntryStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<FinancialStatusChip status={FinancialEntryStatus.APPROVED} className="my-custom" />);
    const chip = screen.getByText('Approved');
    expect(chip.className).toContain('my-custom');
  });
});
