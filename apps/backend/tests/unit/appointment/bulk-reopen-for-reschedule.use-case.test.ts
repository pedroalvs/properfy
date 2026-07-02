/**
 * BulkReopenForRescheduleUseCase (026 §FR-540..545) — 30-day window check.
 *
 * The 30-day rescheduling window applies to client roles only; AM/OP are
 * platform-internal actors and are exempt from the window.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-reopen-for-reschedule.use-case';
import type { ReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000000010';
const GROUP_ID = 'gggggggg-0000-4000-8000-000000000001';
const SCHEDULED_DATE = new Date('2026-06-15T00:00:00Z');

function actorWithRole(role: 'AM' | 'OP' | 'CL_ADMIN') {
  return {
    userId: `${role.toLowerCase()}-1`,
    tenantId: role === 'CL_ADMIN' ? 'tenant-a' : null,
    role,
    branchId: null,
    inspectorId: null,
  };
}

function makeMocks() {
  const reopenForReschedule = {
    execute: vi.fn().mockResolvedValue({}),
  } as unknown as ReopenForRescheduleUseCase;
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({
      appointment: { serviceGroupId: GROUP_ID, scheduledDate: SCHEDULED_DATE },
    }),
  } as unknown as IAppointmentRepository;
  const idempotency: IIdempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  } as unknown as IIdempotencyService;
  return { reopenForReschedule, appointmentRepo, idempotency };
}

function makeUseCase(mocks: ReturnType<typeof makeMocks>) {
  return new BulkReopenForRescheduleUseCase(
    mocks.reopenForReschedule,
    mocks.appointmentRepo,
    mocks.idempotency,
    () => new Date('2026-06-20T12:00:00Z'),
  );
}

// 2026-08-15 is 61 days after the scheduledDate anchor — beyond the 30-day window.
const BEYOND_WINDOW_DATE = '2026-08-15';
// 2026-07-01 is 16 days after the anchor — inside the window.
const WITHIN_WINDOW_DATE = '2026-07-01';

describe('BulkReopenForRescheduleUseCase — 30-day window', () => {
  let mocks: ReturnType<typeof makeMocks>;
  beforeEach(() => { mocks = makeMocks(); });

  it.each(['AM', 'OP'] as const)('exempts %s from the 30-day window', async (role) => {
    const out = await makeUseCase(mocks).execute({
      appointmentIds: [APPT_A],
      newDate: BEYOND_WINDOW_DATE,
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      actor: actorWithRole(role),
    });

    expect(out.results).toEqual([{ appointmentId: APPT_A, status: 'OK' }]);
    expect(mocks.reopenForReschedule.execute).toHaveBeenCalledTimes(1);
  });

  it('blocks CL_ADMIN beyond the 30-day window with INVALID_DATE_WINDOW', async () => {
    const out = await makeUseCase(mocks).execute({
      appointmentIds: [APPT_A],
      newDate: BEYOND_WINDOW_DATE,
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      actor: actorWithRole('CL_ADMIN'),
    });

    expect(out.results).toEqual([{
      appointmentId: APPT_A,
      status: 'INVALID_TRANSITION',
      error: {
        code: 'INVALID_DATE_WINDOW',
        message: 'New date exceeds 30-day rescheduling window from 2026-06-15',
      },
    }]);
    expect(mocks.reopenForReschedule.execute).not.toHaveBeenCalled();
  });

  it('allows CL_ADMIN within the 30-day window', async () => {
    const out = await makeUseCase(mocks).execute({
      appointmentIds: [APPT_A],
      newDate: WITHIN_WINDOW_DATE,
      newTimeSlotStart: '09:00', newTimeSlotEnd: '10:00',
      actor: actorWithRole('CL_ADMIN'),
    });

    expect(out.results).toEqual([{ appointmentId: APPT_A, status: 'OK' }]);
    expect(mocks.reopenForReschedule.execute).toHaveBeenCalledTimes(1);
  });
});
