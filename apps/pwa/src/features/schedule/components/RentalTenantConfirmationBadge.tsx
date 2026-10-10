import type { ComponentType } from 'react';
import { CheckCircle2, Clock, HelpCircle, XCircle, type LucideProps } from 'lucide-react';
import type { RentalTenantConfirmationStatus } from '@properfy/shared';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { RENTAL_TENANT_CONFIRMATION_STATUS_MAP } from '@/lib/status-colors';

interface RentalTenantConfirmationBadgeProps {
  status: RentalTenantConfirmationStatus;
}

const tones: Record<RentalTenantConfirmationStatus, NonNullable<BadgeProps['tone']>> = {
  CONFIRMED: 'green',
  PENDING: 'amber',
  UNAVAILABLE: 'red',
  NO_RESPONSE: 'gray',
};

const icons: Record<RentalTenantConfirmationStatus, ComponentType<LucideProps>> = {
  CONFIRMED: CheckCircle2,
  PENDING: Clock,
  UNAVAILABLE: XCircle,
  NO_RESPONSE: HelpCircle,
};

export function RentalTenantConfirmationBadge({ status }: RentalTenantConfirmationBadgeProps) {
  const label = RENTAL_TENANT_CONFIRMATION_STATUS_MAP[status].label;
  const Icon = icons[status];

  return (
    <Badge tone={tones[status]} className="ml-auto shrink-0" data-testid="confirmation-badge">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
