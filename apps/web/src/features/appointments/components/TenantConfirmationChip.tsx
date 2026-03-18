import type { TenantConfirmationStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface TenantConfirmationChipProps {
  status: TenantConfirmationStatus;
  className?: string;
}

export function TenantConfirmationChip({ status, className }: TenantConfirmationChipProps) {
  const style = TENANT_CONFIRMATION_STATUS_MAP[status];
  return <StatusChip label={style.label} bg={style.bg} className={className} />;
}
