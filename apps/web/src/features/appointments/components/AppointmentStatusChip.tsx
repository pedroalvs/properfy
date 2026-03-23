import type { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

interface AppointmentStatusChipProps {
  status: AppointmentStatus;
  className?: string;
}

export function AppointmentStatusChip({ status, className }: AppointmentStatusChipProps) {
  const style = APPOINTMENT_STATUS_MAP[status];
  if (!style) return null;
  return <StatusChip label={style.label} bg={style.bg} text={style.text} className={className} />;
}
