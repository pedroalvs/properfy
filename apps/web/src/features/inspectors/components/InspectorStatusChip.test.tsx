import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorStatus } from '@properfy/shared';
import { InspectorStatusChip } from './InspectorStatusChip';

const STATUS_LABELS: Record<InspectorStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

describe('InspectorStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<InspectorStatusChip status={status as InspectorStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<InspectorStatusChip status={InspectorStatus.ACTIVE} className="my-custom" />);
    const chip = screen.getByText('Active');
    expect(chip.className).toContain('my-custom');
  });
});
