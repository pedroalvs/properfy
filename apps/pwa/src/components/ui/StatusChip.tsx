import { cn } from '@properfy/frontend-standards';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { APPOINTMENT_STATUS_MAP } from '@/lib/status-colors';
import { AppointmentStatus } from '@properfy/shared';

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

/** Appointment status → validated pill tone. */
const STATUS_TONE: Record<AppointmentStatus, NonNullable<BadgeProps['tone']>> = {
  [AppointmentStatus.DONE]: 'green',
  [AppointmentStatus.SCHEDULED]: 'blue',
  [AppointmentStatus.AWAITING_INSPECTOR]: 'amber',
  [AppointmentStatus.DRAFT]: 'gray',
  [AppointmentStatus.CANCELLED]: 'red',
  [AppointmentStatus.REJECTED]: 'red',
};

export function StatusChip(props: StatusChipProps) {
  const { className } = props;

  // Appointment status: render the validated pill, mapping the status to a tone.
  if ('status' in props && props.status) {
    return (
      <Badge tone={STATUS_TONE[props.status]} className={className}>
        {APPOINTMENT_STATUS_MAP[props.status].label}
      </Badge>
    );
  }

  // Caller-provided colour: honour the explicit bg via inline style.
  const { label, bg } = props as StatusChipByLabelProps;
  return (
    <span
      className={cn(
        'inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 text-foreground',
        className,
      )}
      style={{ backgroundColor: bg }}
    >
      {label}
    </span>
  );
}
