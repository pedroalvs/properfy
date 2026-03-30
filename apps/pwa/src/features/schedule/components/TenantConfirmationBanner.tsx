import { TenantConfirmationStatus } from '@properfy/shared';

interface TenantConfirmationBannerProps {
  status: TenantConfirmationStatus;
}

const bannerConfig: Record<
  TenantConfirmationStatus,
  { icon: string; label: string; sublabel: string; bg: string; border: string; text: string }
> = {
  [TenantConfirmationStatus.CONFIRMED]: {
    icon: 'mdi-check-circle',
    label: 'Tenant confirmed',
    sublabel: 'Tenant has confirmed availability for this inspection.',
    bg: 'bg-success/8',
    border: 'border-success/20',
    text: 'text-success',
  },
  [TenantConfirmationStatus.PENDING]: {
    icon: 'mdi-clock-outline',
    label: 'Awaiting confirmation',
    sublabel: 'Tenant has not yet responded to the confirmation request.',
    bg: 'bg-warning/8',
    border: 'border-warning/20',
    text: 'text-warning',
  },
  [TenantConfirmationStatus.UNAVAILABLE]: {
    icon: 'mdi-close-circle',
    label: 'Tenant unavailable',
    sublabel: 'Tenant indicated they are not available. Confirm with your coordinator.',
    bg: 'bg-error/8',
    border: 'border-error/20',
    text: 'text-error',
  },
  [TenantConfirmationStatus.NO_RESPONSE]: {
    icon: 'mdi-help-circle-outline',
    label: 'No response',
    sublabel: 'Tenant did not respond. Check with your coordinator before attending.',
    bg: 'bg-text-muted/8',
    border: 'border-text-muted/20',
    text: 'text-text-secondary',
  },
};

export function TenantConfirmationBanner({ status }: TenantConfirmationBannerProps) {
  const cfg = bannerConfig[status];

  return (
    <section
      className={`flex items-start gap-3 rounded-[20px] border px-4 py-3.5 ${cfg.bg} ${cfg.border}`}
      data-testid="tenant-confirmation-banner"
      role="status"
    >
      <i className={`mdi ${cfg.icon} text-xl ${cfg.text} shrink-0 mt-0.5`} aria-hidden="true" />
      <div>
        <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{cfg.sublabel}</p>
      </div>
    </section>
  );
}
