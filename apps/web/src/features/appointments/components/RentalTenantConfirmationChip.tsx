import type { RentalTenantConfirmationStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface RentalTenantConfirmationChipProps {
  status: RentalTenantConfirmationStatus;
  className?: string;
}

export function RentalTenantConfirmationChip({ status, className }: RentalTenantConfirmationChipProps) {
  const style = RENTAL_TENANT_CONFIRMATION_STATUS_MAP[status];
  if (!style) return null;
  return <StatusChip label={style.label} bg={style.bg} className={className} />;
}
