import type { ReportStatus } from '@properfy/shared';
import { REPORT_STATUS_MAP } from '@/lib/status-colors';

interface ReportStatusChipProps {
  status: ReportStatus;
  className?: string;
}

export function ReportStatusChip({ status, className = '' }: ReportStatusChipProps) {
  const style = REPORT_STATUS_MAP[status];
  if (!style) return null;

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
