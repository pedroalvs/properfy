import type { AppointmentStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

interface StatusChipProps {
  status: AppointmentStatus;
  className?: string;
}

export function StatusChip({ status, className = '' }: StatusChipProps) {
  const style = APPOINTMENT_STATUS_MAP[status];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
