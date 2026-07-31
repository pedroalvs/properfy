import type { AvailableSlot } from '@properfy/shared';
import { orderSlots, formatSlot } from '../lib/availability-slots';

interface TenantAvailabilitySlotsProps {
  slots?: AvailableSlot[] | null;
}

/**
 * The weekly availability a rental tenant offers when declining an inspection in the
 * portal. Renders nothing when there is none, so call sites can drop it in directly.
 *
 * Labels and ordering come from `lib/availability-slots`, shared with the map's
 * Confirm column, which renders the same slots as a single tooltip line.
 */
export function TenantAvailabilitySlots({ slots }: TenantAvailabilitySlotsProps) {
  if (!slots || slots.length === 0) return null;

  // The picker already emits Mon→Sun order; sort anyway so legacy rows read the same.
  const ordered = orderSlots(slots);

  return (
    <ul className="flex flex-wrap gap-1.5">
      {ordered.map((slot, idx) => (
        <li
          key={`${slot.dayOfWeek}-${slot.start}-${idx}`}
          className="inline-flex items-center rounded border border-black/10 bg-app-bg px-2 py-0.5 text-sm text-text-primary"
        >
          {formatSlot(slot)}
        </li>
      ))}
    </ul>
  );
}
