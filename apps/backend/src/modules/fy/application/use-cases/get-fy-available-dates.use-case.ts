import type { FyAvailableDates } from '@properfy/shared';
import { addCivilDays } from '@properfy/shared';

import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import { buildPortalEligibleSlots } from '../../../service-group/domain/portal-slot-capacity';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { NoticePeriodViolationError } from '../../domain/fy.errors';
import type { IFyRepository } from '../../domain/fy.repository';

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
    private readonly fyRepo: IFyRepository,
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
    const members = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today,
    });
    // Same rule as the portal picker, so the agent never quotes a window the
    // tenant would then be refused on.
    const rows = buildPortalEligibleSlots(members);

    // The RTA notice period counts civil days where the property is — the
    // agency's timezone — not UTC days. A raw-UTC floor is one day short for
    // any request made after ~10:00 UTC (evening in Australia).
    const agency = await this.fyRepo.findAgencyById(appointment.tenantId);
    const timezone = agency?.timezone ?? PLATFORM_TIMEZONE;
    const noticeFloorIso = addCivilDays(
      civilDateInTimezone(today, timezone),
      NOTICE_PERIOD_DAYS,
    );

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
