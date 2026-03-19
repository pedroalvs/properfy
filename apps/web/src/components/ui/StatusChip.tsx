import type { AppointmentStatus } from '@properfy/shared';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';

interface StatusChipByStatusProps {
  status: AppointmentStatus;
  label?: never;
  bg?: never;
  className?: string;
}

interface StatusChipByLabelProps {
  status?: never;
  label: string;
  bg: string;
  className?: string;
}

type StatusChipProps = StatusChipByStatusProps | StatusChipByLabelProps;

export function StatusChip(props: StatusChipProps) {
  const { className = '' } = props;

  let label: string;
  let bg: string;
  let text: string;

  if ('status' in props && props.status) {
    const style = APPOINTMENT_STATUS_MAP[props.status];
    if (!style) return null;
    label = style.label;
    bg = style.bg;
    text = style.text;
  } else {
    label = (props as StatusChipByLabelProps).label;
    bg = (props as StatusChipByLabelProps).bg;
    text = 'var(--color-text-primary)';
  }

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
