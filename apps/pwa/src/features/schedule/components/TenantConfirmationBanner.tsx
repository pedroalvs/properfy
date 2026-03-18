import { TenantConfirmationStatus } from '@properfy/shared';

interface TenantConfirmationBannerProps {
  status: TenantConfirmationStatus;
}

const bannerConfig: Record<TenantConfirmationStatus, { icon: string; label: string; bg: string; text: string }> = {
  [TenantConfirmationStatus.CONFIRMED]: {
    icon: 'mdi-check-circle',
    label: 'Tenant confirmed availability',
    bg: 'bg-success/10',
    text: 'text-success',
  },
  [TenantConfirmationStatus.PENDING]: {
    icon: 'mdi-clock-outline',
    label: 'Awaiting tenant confirmation',
    bg: 'bg-warning/10',
    text: 'text-warning',
  },
  [TenantConfirmationStatus.UNAVAILABLE]: {
    icon: 'mdi-close-circle',
    label: 'Tenant is unavailable',
    bg: 'bg-error/10',
    text: 'text-error',
  },
  [TenantConfirmationStatus.NO_RESPONSE]: {
    icon: 'mdi-help-circle-outline',
    label: 'No response from tenant',
    bg: 'bg-text-muted/10',
    text: 'text-text-muted',
  },
};

export function TenantConfirmationBanner({ status }: TenantConfirmationBannerProps) {
  const config = bannerConfig[status];

  return (
    <div
      className={`flex items-center gap-2 rounded-lg p-3 ${config.bg}`}
      data-testid="tenant-confirmation-banner"
      role="status"
    >
      <i className={`mdi ${config.icon} text-lg ${config.text}`} aria-hidden="true" />
      <span className={`text-sm font-semibold ${config.text}`}>{config.label}</span>
    </div>
  );
}
