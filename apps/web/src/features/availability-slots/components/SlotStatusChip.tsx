import { AvailabilitySlotStatus } from '@properfy/shared';
import type { StatusStyle } from '@/lib/status-colors';

const SLOT_STATUS_MAP: Record<AvailabilitySlotStatus, StatusStyle> = {
  [AvailabilitySlotStatus.AVAILABLE]: {
    bg: 'var(--color-status-done)',
    text: 'var(--color-text-primary)',
    label: 'Available',
  },
  [AvailabilitySlotStatus.BOOKED]: {
    bg: 'var(--color-status-scheduled)',
    text: 'var(--color-text-primary)',
    label: 'Booked',
  },
  [AvailabilitySlotStatus.CANCELLED]: {
    bg: 'var(--color-status-cancelled)',
    text: 'var(--color-text-primary)',
    label: 'Cancelled',
  },
};

interface SlotStatusChipProps {
  status: string;
  className?: string;
}

export function SlotStatusChip({ status, className = '' }: SlotStatusChipProps) {
  const style = SLOT_STATUS_MAP[status as AvailabilitySlotStatus] ?? {
    bg: '#E0E0E0',
    text: 'var(--color-text-primary)',
    label: status,
  };

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold leading-5 ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  );
}

export { SLOT_STATUS_MAP };
