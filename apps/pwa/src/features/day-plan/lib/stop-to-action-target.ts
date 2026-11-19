import type { DayPlanStop } from '@properfy/shared';
import type { ExecutionActionTarget } from '@/features/execution/components/AppointmentActionBar';

/**
 * Adapts a day-plan stop to the shared {@link ExecutionActionTarget} so the
 * Today screen's Next card drives the same check-in/out + field-event bar as the
 * schedule card. The stop's booked window (`windowStart`/`windowEnd`) is the
 * time slot, and `serviceStartAt` is the published reference for a late notice.
 */
export function stopToActionTarget(stop: DayPlanStop, planDate: string): ExecutionActionTarget {
  return {
    id: stop.appointmentId,
    appointmentCode: stop.appointmentCode,
    scheduledDate: planDate,
    propertyAddress: stop.propertyAddress,
    timeSlotStart: stop.windowStart,
    timeSlotEnd: stop.windowEnd,
    publishedServiceStartAt: stop.serviceStartAt,
  };
}
