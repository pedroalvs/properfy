import type { TenantConfirmationStatus } from '@properfy/shared';
import { TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface TenantConfirmationBadgeProps {
  status: TenantConfirmationStatus;
}

const icons: Record<TenantConfirmationStatus, string> = {
  CONFIRMED: 'mdi-check-circle',
  PENDING: 'mdi-clock-outline',
  UNAVAILABLE: 'mdi-close-circle',
  NO_RESPONSE: 'mdi-help-circle-outline',
};

export function TenantConfirmationBadge({ status }: TenantConfirmationBadgeProps) {
  const style = TENANT_CONFIRMATION_STATUS_MAP[status];

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
