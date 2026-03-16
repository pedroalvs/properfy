import type { FinancialEntryType } from '@properfy/shared';
import { FINANCIAL_ENTRY_TYPE_MAP } from '@/lib/status-colors';

interface FinancialEntryTypeChipProps {
  entryType: FinancialEntryType;
  className?: string;
}

export function FinancialEntryTypeChip({ entryType, className = '' }: FinancialEntryTypeChipProps) {
  const style = FINANCIAL_ENTRY_TYPE_MAP[entryType];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
