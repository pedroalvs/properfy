import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { InvoiceStatus } from '@/lib/status-colors';
import { InvoiceStatusChip } from './InvoiceStatusChip';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING_REVIEW: 'Pending Review',
  OPEN: 'Open',
  CLOSED: 'Closed',
  PAID: 'Paid',
  SUPERSEDED: 'Superseded',
};

describe('InvoiceStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<InvoiceStatusChip status={status as InvoiceStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<InvoiceStatusChip status="PAID" className="my-custom" />);
    const chip = screen.getByText('Paid');
    expect(chip.className).toContain('my-custom');
  });
});
