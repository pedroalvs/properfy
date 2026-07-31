import type { AvailableSlot, DayOfWeek } from '@properfy/shared';

/**
 * Day labels and ordering for the rental tenant's weekly availability.
 *
 * These live here rather than in a component because two surfaces render the
 * same slots differently — `TenantAvailabilitySlots` as chips, the map's
 * Confirm column as a single tooltip line — and a second copy of the labels
 * would drift the first time one of them changes.
 *
 * Mirrors the portal picker the tenant fills in
 * (`components/forms/WeeklyAvailabilityPicker.tsx`).
 */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
  SUN: 'Sun',
};

const DAY_ORDER: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/** Mon→Sun ordering. Copies first — the caller's array is often query data. */
export function orderSlots(slots: AvailableSlot[]): AvailableSlot[] {
  return [...slots].sort(
    (a, b) => DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek),
  );
}

/** A single slot as `Mon 09:00 - 12:00`. */
export function formatSlot(slot: AvailableSlot): string {
  return `${DAY_LABELS[slot.dayOfWeek] ?? slot.dayOfWeek} ${slot.start} - ${slot.end}`;
}

/**
 * The whole week on one line, for tooltips and other single-line contexts.
 * Empty string when there is nothing to show, so each caller chooses its own
 * "no availability" wording.
 */
export function formatAvailabilitySlots(slots: AvailableSlot[] | null | undefined): string {
  if (!slots?.length) return '';
  return orderSlots(slots).map(formatSlot).join(' · ');
}
