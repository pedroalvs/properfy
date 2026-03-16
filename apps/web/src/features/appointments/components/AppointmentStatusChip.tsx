import type { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';

interface AppointmentStatusChipProps {
  status: AppointmentStatus;
  className?: string;
}

export function AppointmentStatusChip({ status, className }: AppointmentStatusChipProps) {
  return <StatusChip status={status} className={className} />;
}
