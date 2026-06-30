import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceGroupStatus } from '@properfy/shared';
import { ServiceGroupStatusChip } from './ServiceGroupStatusChip';

const STATUS_LABELS: Record<ServiceGroupStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Awaiting Inspector',
  ACCEPTED: 'Accepted',
  CANCELLED: 'Canceled',
  REJECTED: 'Rejected',
};

describe('ServiceGroupStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<ServiceGroupStatusChip status={status as ServiceGroupStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<ServiceGroupStatusChip status={ServiceGroupStatus.DRAFT} className="my-custom" />);
    const chip = screen.getByText('Draft');
    expect(chip.className).toContain('my-custom');
  });
});
