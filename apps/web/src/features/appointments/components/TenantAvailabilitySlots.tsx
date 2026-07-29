import type { AvailableSlot, DayOfWeek } from '@properfy/shared';

// Mirrors the labels and ordering of the portal picker the rental tenant fills in
// (features/rental-tenant-portal/components/WeeklyAvailabilityPicker.tsx).
const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

const DAY_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

interface TenantAvailabilitySlotsProps {
  slots?: AvailableSlot[] | null;
}

/**
 * The weekly availability a rental tenant offers when declining an inspection in the
 * portal. Renders nothing when there is none, so call sites can drop it in directly.
 */
export function TenantAvailabilitySlots({ slots }: TenantAvailabilitySlotsProps) {
  if (!slots || slots.length === 0) return null;

  // The picker already emits Mon→Sun order; sort anyway so legacy rows read the same.
  const ordered = [...slots].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek),
  );

  return (
    <ul className="flex flex-wrap gap-1.5">
      {ordered.map((slot, idx) => (
        <li
          key={`${slot.dayOfWeek}-${slot.start}-${idx}`}
          className="inline-flex items-center rounded border border-black/10 bg-app-bg px-2 py-0.5 text-sm text-text-primary"
        >
          {`${DAY_LABELS[slot.dayOfWeek] ?? slot.dayOfWeek} ${slot.start} - ${slot.end}`}
        </li>
      ))}
    </ul>
  );
}
