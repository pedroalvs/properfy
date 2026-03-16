import type { ServiceGroupStatus } from '@properfy/shared';
import { SERVICE_GROUP_STATUS_MAP } from '@/lib/status-colors';

interface ServiceGroupStatusChipProps {
  status: ServiceGroupStatus;
  className?: string;
}

export function ServiceGroupStatusChip({ status, className = '' }: ServiceGroupStatusChipProps) {
  const style = SERVICE_GROUP_STATUS_MAP[status];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
