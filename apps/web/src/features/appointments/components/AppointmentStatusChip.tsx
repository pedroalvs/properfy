import type { AppointmentStatus } from '@properfy/shared';
import { StatusChip } from '@/components/ui/StatusChip';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

interface AppointmentStatusChipProps {
  status: AppointmentStatus;
  doneCheckedByUserId?: string | null;
  isOverdue?: boolean;
  className?: string;
}

export function AppointmentStatusChip({ status, doneCheckedByUserId, isOverdue, className }: AppointmentStatusChipProps) {
  const style = APPOINTMENT_STATUS_MAP[status];
  if (!style) return null;

  let label = style.label;
  if (status === 'DONE') {
    label = doneCheckedByUserId ? 'Done (Review)' : 'Done (Review Required)';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <StatusChip label={label} bg={style.bg} text={style.text} />
      {isOverdue && (
        <StatusChip label="Overdue" bg="#FFCDD2" text="rgba(0,0,0,0.87)" />
      )}
    </span>
  );
}
