import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportType } from '@properfy/shared';
import { ReportTypeChip } from './ReportTypeChip';

const TYPE_LABELS: Record<ReportType, string> = {
  APPOINTMENTS: 'Appointments',
  FINANCIAL: 'Financial',
  PERFORMANCE: 'Performance',
  AGENCIES: 'Agencies',
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
    render(<ReportTypeChip reportType={ReportType.FINANCIAL} className="my-custom" />);
    const chip = screen.getByText('Financial');
    expect(chip.className).toContain('my-custom');
  });
});
