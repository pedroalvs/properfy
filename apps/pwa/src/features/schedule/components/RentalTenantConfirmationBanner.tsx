import type { ComponentType } from 'react';
import { CheckCircle2, Clock, HelpCircle, XCircle, type LucideProps } from 'lucide-react';
import { RentalTenantConfirmationStatus } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';

interface RentalTenantConfirmationBannerProps {
  status: RentalTenantConfirmationStatus;
}

const bannerConfig: Record<
  RentalTenantConfirmationStatus,
  { icon: ComponentType<LucideProps>; label: string; sublabel: string; bg: string; border: string; text: string }
> = {
  [RentalTenantConfirmationStatus.CONFIRMED]: {
    icon: CheckCircle2,
    label: 'Tenant confirmed',
    sublabel: 'Tenant has confirmed availability for this inspection.',
    bg: 'bg-success/8',
    border: 'border-success/20',
    text: 'text-success',
  },
  [RentalTenantConfirmationStatus.PENDING]: {
    icon: Clock,
    label: 'Awaiting confirmation',
    sublabel: 'Tenant has not yet responded to the confirmation request.',
    bg: 'bg-warning/8',
    border: 'border-warning/20',
    text: 'text-warning',
  },
  [RentalTenantConfirmationStatus.UNAVAILABLE]: {
    icon: XCircle,
    label: 'Tenant unavailable',
    sublabel: 'Tenant indicated they are not available. Confirm with your coordinator.',
    bg: 'bg-destructive/8',
    border: 'border-destructive/20',
    text: 'text-destructive',
  },
  [RentalTenantConfirmationStatus.NO_RESPONSE]: {
    icon: HelpCircle,
    label: 'No response',
    sublabel: 'Tenant did not respond. Check with your coordinator before attending.',
    bg: 'bg-muted',
    border: 'border-border',
    text: 'text-muted-foreground',
  },
};

export function RentalTenantConfirmationBanner({ status }: RentalTenantConfirmationBannerProps) {
  const cfg = bannerConfig[status];
  const Icon = cfg.icon;

  return (
    <section
      className={cn('flex items-start gap-3 rounded-card border px-4 py-3.5', cfg.bg, cfg.border)}
      data-testid="tenant-confirmation-banner"
      role="status"
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', cfg.text)} aria-hidden="true" />
      <div>
        <p className={cn('text-sm font-bold', cfg.text)}>{cfg.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{cfg.sublabel}</p>
      </div>
    </section>
  );
}
