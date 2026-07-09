import type { FyAppointmentsByPhone, FyAppointmentSummary } from '@properfy/shared';
import { toE164Au } from '@properfy/shared';

import { ValidationError } from '../../../../shared/domain/errors';
import { NoActiveAppointmentsError } from '../../domain/fy.errors';
import { formatAppointmentCode, type FyAppointmentRow, type IFyRepository } from '../../domain/fy.repository';

export interface FindFyAppointmentsByPhoneInput {
  phone: string;
  statusIn?: string[];
}

const DEFAULT_STATUSES = ['AWAITING_INSPECTOR', 'SCHEDULED'];
/** DONE appointments stay visible for follow-up questions for this window. */
const DONE_LOOKBACK_HOURS = 48;

export function toFyAppointmentSummary(row: FyAppointmentRow): FyAppointmentSummary {
  return {
    id: row.id,
    code: formatAppointmentCode(row.appointmentCodePrefix, row.appointmentNumber),
    status: row.status as FyAppointmentSummary['status'],
    serviceType: { id: row.serviceTypeId, name: row.serviceTypeName },
    scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
    timeSlotStart: row.timeSlotStart,
    timeSlotEnd: row.timeSlotEnd,
    propertyAddress: row.propertyAddress,
    agency: { id: row.tenantId, name: row.tenantName },
  };
}

/** Digit-only variants an AU number may be stored as (+61…, 0…, 61…). */
export function phoneDigitVariants(e164: string): string[] {
  const digits = e164.replace(/\D/g, ''); // 61412345678
  return [digits, `0${digits.slice(2)}`];
}

export class FindFyAppointmentsByPhoneUseCase {
  constructor(private readonly fyRepo: IFyRepository) {}

  async execute(input: FindFyAppointmentsByPhoneInput): Promise<FyAppointmentsByPhone> {
    const e164 = toE164Au(input.phone);
    if (!e164) {
      throw new ValidationError('INVALID_PHONE', 'phone must be a valid AU number');
    }

    const statuses = input.statusIn ?? DEFAULT_STATUSES;
    const match = await this.fyRepo.findAppointmentsByContactPhone({
      phoneDigitVariants: phoneDigitVariants(e164),
      statuses,
      // Only the default view includes the DONE grace window; an explicit
      // statusIn filter is honoured as-is.
      doneWithinHours: input.statusIn ? 0 : DONE_LOOKBACK_HOURS,
    });

    if (!match || match.appointments.length === 0) {
      throw new NoActiveAppointmentsError();
    }

    return {
      contact: match.contact,
      appointments: match.appointments.map(toFyAppointmentSummary),
    };
  }
}
