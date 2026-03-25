import type { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

interface AppointmentStatusChipProps {
  status: AppointmentStatus;
  doneCheckedByUserId?: string | null;
  className?: string;
}

export function AppointmentStatusChip({ status, doneCheckedByUserId, className }: AppointmentStatusChipProps) {
  const style = APPOINTMENT_STATUS_MAP[status];
  if (!style) return null;

  let label = style.label;
  if (status === 'DONE') {
    label = doneCheckedByUserId ? 'Done (Review)' : 'Done (Review Required)';
  }

  return <StatusChip label={label} bg={style.bg} text={style.text} className={className} />;
}
