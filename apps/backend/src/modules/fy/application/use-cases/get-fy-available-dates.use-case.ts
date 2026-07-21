import type { FyAvailableDates } from '@properfy/shared';

import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import { NoticePeriodViolationError } from '../../domain/fy.errors';

export interface GetFyAvailableDatesInput {
  appointmentId: string;
  limit: number;
}

/** Residential Tenancies Act 2010 — minimum notice for a new inspection date. */
const NOTICE_PERIOD_DAYS = 7;
/** Legal visit window: 08:00–20:00, weekdays only. */
const WINDOW_START = '08:00';
const WINDOW_END = '20:00';

function isWeekday(dateIso: string): boolean {
  const day = new Date(`${dateIso}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/**
 * Informative fallback for "what dates are available?" asked over WhatsApp.
 * Dates come from existing accepted service groups the appointment could join
 * (the same pool the tenant portal reschedule offers), filtered by the legal
 * constraints. The canonical action path remains the confirmation link.
 */
export class GetFyAvailableDatesUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
  ) {}

  async execute(input: GetFyAvailableDatesInput): Promise<FyAvailableDates> {
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new AppointmentNotFoundError();
    }
    const { appointment } = result;
    if (!appointment.propertyId || !appointment.serviceTypeId) {
      return { availableDates: [] };
    }

    const today = new Date();
    const rows = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today,
    });

    const noticeFloor = new Date(today.getTime());
    noticeFloor.setUTCDate(noticeFloor.getUTCDate() + NOTICE_PERIOD_DAYS);
    const noticeFloorIso = noticeFloor.toISOString().slice(0, 10);

    const legal = rows
      .map((g) => ({
        date: g.scheduledDate.toISOString().slice(0, 10),
        start: g.timeSlotStart,
        end: g.timeSlotEnd,
      }))
      .filter((s) => isWeekday(s.date) && s.start >= WINDOW_START && s.end <= WINDOW_END);

    const withNotice = legal.filter((s) => s.date >= noticeFloorIso);

    // Candidates exist but every one breaches the 7-day notice → explicit 409
    // so the agent can explain the legal constraint instead of saying "none".
    if (legal.length > 0 && withNotice.length === 0) {
      throw new NoticePeriodViolationError();
    }

    const byDate = new Map<string, Array<{ start: string; end: string }>>();
    for (const slot of withNotice.sort((a, b) => a.date.localeCompare(b.date))) {
      const slots = byDate.get(slot.date) ?? [];
      if (!slots.some((s) => s.start === slot.start && s.end === slot.end)) {
        slots.push({ start: slot.start, end: slot.end });
      }
      byDate.set(slot.date, slots);
    }

    return {
      availableDates: [...byDate.entries()]
        .slice(0, input.limit)
        .map(([date, timeSlots]) => ({ date, timeSlots })),
    };
  }
}
