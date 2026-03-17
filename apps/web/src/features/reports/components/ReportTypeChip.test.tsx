import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportType } from '@properfy/shared';
import { ReportTypeChip } from './ReportTypeChip';

const TYPE_LABELS: Record<ReportType, string> = {
  INSPECTIONS_SCHEDULED: 'Scheduled Inspections',
  INSPECTIONS_DONE: 'Completed Inspections',
  INSPECTIONS_CANCELLED: 'Cancelled Inspections',
  INSPECTIONS_REJECTED: 'Rejected Inspections',
  INSPECTOR_PERFORMANCE: 'Inspector Performance',
  CONFIRMATION_STATUS: 'Confirmation Status',
  FINANCIAL_SERVICES: 'Financial Services',
};

describe('ReportTypeChip', () => {
  it.each(Object.entries(TYPE_LABELS))(
    'renders correct label for %s',
    (type, label) => {
      render(<ReportTypeChip reportType={type as ReportType} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<ReportTypeChip reportType={ReportType.INSPECTIONS_DONE} className="my-custom" />);
    const chip = screen.getByText('Completed Inspections');
    expect(chip.className).toContain('my-custom');
  });
});
