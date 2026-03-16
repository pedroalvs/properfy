import type { TenantConfirmationStatus } from '@properfy/shared';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface TenantConfirmationStatusChipProps {
  status: TenantConfirmationStatus;
  className?: string;
}

export function TenantConfirmationStatusChip({ status, className = '' }: TenantConfirmationStatusChipProps) {
  const style = TENANT_CONFIRMATION_STATUS_MAP[status];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
