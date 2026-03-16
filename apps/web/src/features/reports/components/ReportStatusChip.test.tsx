import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReportStatus } from '@properfy/shared';
import { ReportStatusChip } from './ReportStatusChip';

const STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  READY: 'Pronto',
  FAILED: 'Falhou',
};

describe('ReportStatusChip', () => {
  it.each(Object.entries(STATUS_LABELS))(
    'renders correct label for %s',
    (status, label) => {
      render(<ReportStatusChip status={status as ReportStatus} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<ReportStatusChip status={ReportStatus.READY} className="my-custom" />);
    const chip = screen.getByText('Pronto');
    expect(chip.className).toContain('my-custom');
  });
});
