import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinancialEntryType } from '@properfy/shared';
import { FinancialEntryTypeChip } from './FinancialEntryTypeChip';

const TYPE_LABELS: Record<FinancialEntryType, string> = {
  TENANT_DEBIT: 'Débito Inquilino',
  INSPECTOR_PAYOUT: 'Pagamento Inspetor',
  REFUND: 'Reembolso',
  MANUAL_ADJUSTMENT: 'Ajuste Manual',
};

describe('FinancialEntryTypeChip', () => {
  it.each(Object.entries(TYPE_LABELS))(
    'renders correct label for %s',
    (type, label) => {
      render(<FinancialEntryTypeChip entryType={type as FinancialEntryType} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('passes className through', () => {
    render(<FinancialEntryTypeChip entryType={FinancialEntryType.REFUND} className="my-custom" />);
    const chip = screen.getByText('Reembolso');
    expect(chip.className).toContain('my-custom');
  });
});
