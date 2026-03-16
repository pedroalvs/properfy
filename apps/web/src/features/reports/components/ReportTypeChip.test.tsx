import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportType } from '@properfy/shared';
import { ReportTypeChip } from './ReportTypeChip';

const TYPE_LABELS: Record<ReportType, string> = {
  INSPECTIONS_SCHEDULED: 'Vistorias Agendadas',
  INSPECTIONS_DONE: 'Vistorias Concluídas',
  INSPECTIONS_CANCELLED: 'Vistorias Canceladas',
  INSPECTIONS_REJECTED: 'Vistorias Rejeitadas',
  INSPECTOR_PERFORMANCE: 'Desempenho Inspetores',
  CONFIRMATION_STATUS: 'Status Confirmação',
  FINANCIAL_SERVICES: 'Serviços Financeiros',
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
    const chip = screen.getByText('Vistorias Concluídas');
    expect(chip.className).toContain('my-custom');
  });
});
