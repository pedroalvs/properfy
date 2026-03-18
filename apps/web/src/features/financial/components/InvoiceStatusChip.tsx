import type { InvoiceStatus } from '@/lib/status-colors';
import { INVOICE_STATUS_MAP } from '@/lib/status-colors';

interface InvoiceStatusChipProps {
  status: InvoiceStatus;
  className?: string;
}

export function InvoiceStatusChip({ status, className = '' }: InvoiceStatusChipProps) {
  const style = INVOICE_STATUS_MAP[status];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
