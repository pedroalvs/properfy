import { TENANT_ADMIN_STATUS_MAP } from '@/lib/status-colors';
import type { TenantAdminStatus } from '../types';

interface TenantStatusChipProps {
  status: TenantAdminStatus;
  className?: string;
}

export function TenantStatusChip({ status, className = '' }: TenantStatusChipProps) {
  const style = TENANT_ADMIN_STATUS_MAP[status];

  if (!style) {
    return (
      <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}>
        {status}
      </span>
    );
  }

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
