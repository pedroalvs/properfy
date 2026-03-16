import type { ReportType } from '@properfy/shared';
import { REPORT_TYPE_MAP } from '@/lib/status-colors';

interface ReportTypeChipProps {
  reportType: ReportType;
  className?: string;
}

export function ReportTypeChip({ reportType, className = '' }: ReportTypeChipProps) {
  const style = REPORT_TYPE_MAP[reportType];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
