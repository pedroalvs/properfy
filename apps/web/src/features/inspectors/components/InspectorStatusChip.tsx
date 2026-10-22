import type { InspectorStatus } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { INSPECTOR_STATUS_MAP } from '@/lib/status-colors';

interface InspectorStatusChipProps {
  status: InspectorStatus;
  className?: string;
}

export function InspectorStatusChip({ status, className = '' }: InspectorStatusChipProps) {
  const style = INSPECTOR_STATUS_MAP[status];
  if (!style) return null;

  return (
    <span
      className={cn('inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5', className)}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}
