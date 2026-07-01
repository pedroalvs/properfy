import type { RentalTenantConfirmationStatus } from '@properfy/shared';
import { RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface RentalTenantConfirmationBadgeProps {
  status: RentalTenantConfirmationStatus;
}

const icons: Record<RentalTenantConfirmationStatus, string> = {
  CONFIRMED: 'mdi-check-circle',
  PENDING: 'mdi-clock-outline',
  UNAVAILABLE: 'mdi-close-circle',
  NO_RESPONSE: 'mdi-help-circle-outline',
};

export function RentalTenantConfirmationBadge({ status }: RentalTenantConfirmationBadgeProps) {
  const style = RENTAL_TENANT_CONFIRMATION_STATUS_MAP[status];

  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold leading-4"
      style={{ backgroundColor: style.bg, color: style.text }}
      data-testid="confirmation-badge"
    >
      <i className={`mdi ${icons[status]} text-xs`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
