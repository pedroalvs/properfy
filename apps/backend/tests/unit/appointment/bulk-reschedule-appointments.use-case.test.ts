/**
 * BulkRescheduleAppointmentsUseCase (025 §FR-421) — delegates to
 * `UpdateAppointmentUseCase` with `{ scheduledDate, timeSlot? }` per item.
 * Pins the same idempotency + result-mapping contract as bulk-cancel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkRescheduleAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-reschedule-appointments.use-case';
import type { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import {
  AppointmentUpdateNotAllowedError,
  AppointmentPastDateError,
} from '../../../src/modules/appointment/domain/appointment.errors';

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000000010';
const APPT_B = 'bbbbbbbb-0000-4000-8000-000000000020';

const actor = {
  userId: 'op-1',
  tenantId: null,
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

function makeMocks() {
  const updateAppointment = {
    execute: vi.fn().mockResolvedValue({}),
  } as unknown as UpdateAppointmentUseCase;
  const idempotency: IIdempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  } as unknown as IIdempotencyService;
  return { updateAppointment, idempotency };
}

describe('BulkRescheduleAppointmentsUseCase', () => {
  let mocks: ReturnType<typeof makeMocks>;
  beforeEach(() => { mocks = makeMocks(); });

  it('passes scheduledDate (and optional timeSlot) to UpdateAppointmentUseCase per id', async () => {
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      newDate: '2026-06-01',
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      actor,
    });

    expect(mocks.updateAppointment.execute).toHaveBeenCalledTimes(2);
    expect(mocks.updateAppointment.execute).toHaveBeenNthCalledWith(1, {
      appointmentId: APPT_A,
      data: { scheduledDate: '2026-06-01', timeSlotStart: '09:00', timeSlotEnd: '10:00' },
      actor,
    });
  });

  it('omits timeSlot when not provided', async () => {
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      actor,
    });

    expect(mocks.updateAppointment.execute).toHaveBeenCalledWith({
      appointmentId: APPT_A,
      data: { scheduledDate: '2026-06-01' },
      actor,
    });
  });

  it('normalises full ISO datetime to YYYY-MM-DD', async () => {
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01T09:00:00.000Z',
      actor,
    });

    expect(mocks.updateAppointment.execute).toHaveBeenCalledWith({
      appointmentId: APPT_A,
      data: { scheduledDate: '2026-06-01' },
      actor,
    });
  });

  it('maps AppointmentUpdateNotAllowedError → INVALID_TRANSITION', async () => {
    (mocks.updateAppointment.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new AppointmentUpdateNotAllowedError());

    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      newDate: '2026-06-01',
      actor,
    });

    expect(out.results[0]?.status).toBe('OK');
    expect(out.results[1]?.status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentPastDateError → INVALID_TRANSITION', async () => {
    (mocks.updateAppointment.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new AppointmentPastDateError());

    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2020-01-01',
      actor,
    });

    expect(out.results[0]?.status).toBe('INVALID_TRANSITION');
  });

  it('IDEMPOTENT_REPLAY skips the delegate on same-day retry', async () => {
    (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      appointmentId: APPT_A,
      status: 'OK',
    });
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      actor,
    });

    expect(out.results[0]?.status).toBe('IDEMPOTENT_REPLAY');
    expect(mocks.updateAppointment.execute).not.toHaveBeenCalled();
  });
});
