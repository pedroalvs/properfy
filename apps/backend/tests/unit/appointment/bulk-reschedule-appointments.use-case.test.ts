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

  it('forwards expandGroupTimeWindow to the delegate when requested', async () => {
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      expandGroupTimeWindow: true,
      actor,
    });

    expect(mocks.updateAppointment.execute).toHaveBeenCalledWith({
      appointmentId: APPT_A,
      data: { scheduledDate: '2026-06-01', timeSlotStart: '09:00', timeSlotEnd: '10:00' },
      expandGroupTimeWindow: true,
      actor,
    });
  });

  // The key already covers date + slot; the flag only decides how a rejection
  // is handled, so an identical re-submit must still replay rather than re-run.
  it('does not let expandGroupTimeWindow change the idempotency key', async () => {
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      expandGroupTimeWindow: true,
      actor,
    });

    expect(mocks.idempotency.getWithHash).toHaveBeenCalledWith(
      `bulk_reschedule:${APPT_A}:2026-06-01:09:00-10:00`,
      'bulk_reschedule',
    );
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

  it('keys by the requested slot — correcting a reschedule re-executes', async () => {
    // Regression: the key used to be `bulk_reschedule:{id}:{day}`, so an
    // operator who rescheduled to the wrong date and immediately corrected it
    // got a silent IDEMPOTENT_REPLAY — the correction never applied. The slot
    // must be part of the key so a DIFFERENT target is a different action.
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
      actor,
    });
    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-02',
      newTimeSlotStart: '09:00',
      newTimeSlotEnd: '10:00',
      actor,
    });

    // Same date, different time slot — also a distinct action.
    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-02',
      newTimeSlotStart: '14:00',
      newTimeSlotEnd: '15:00',
      actor,
    });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(([k]) => k as string);
    expect(calls[0]).not.toBe(calls[1]);
    expect(calls[1]).not.toBe(calls[2]);
    expect(calls[0]).toContain('2026-06-01');
    expect(calls[1]).toContain('2026-06-02');
    // The slot itself must discriminate, not just the date.
    expect(calls[1]).toContain('09:00-10:00');
    expect(calls[2]).toContain('14:00-15:00');
    // ...and no day bucket: the replay window is the TTL alone.
    expect(calls[0]).not.toContain('2026-04-15');
    // Every distinct slot reached the delegate — none was swallowed as a replay.
    expect(mocks.updateAppointment.execute).toHaveBeenCalledTimes(3);
  });

  it('keys off the EFFECTIVE slot — a half-specified slot is not applied, so it must not change the key', async () => {
    // The delegate only applies the slot when both ends are present. A request
    // with just a start mutates the date alone, exactly like a request with no
    // slot at all — so both must produce the same key, or the replay guard
    // misses two identical mutations.
    const useCase = new BulkRescheduleAppointmentsUseCase(
      mocks.updateAppointment,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({ appointmentIds: [APPT_A], newDate: '2026-06-01', actor });
    await useCase.execute({
      appointmentIds: [APPT_A],
      newDate: '2026-06-01',
      newTimeSlotStart: '09:00', // no end → slot not applied by the delegate
      actor,
    });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(([k]) => k as string);
    expect(calls[0]).toBe(calls[1]);
  });

  it('IDEMPOTENT_REPLAY skips the delegate on an immediate retry', async () => {
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
