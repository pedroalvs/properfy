/**
 * BulkCancelAppointmentsUseCase (025 §FR-411) — delegates per-item to
 * `ExecuteStatusTransitionUseCase` with `targetStatus: CANCELLED`. The
 * tests here pin the contract that:
 *  - the underlying use case is called once per id with the expected payload,
 *  - per-day idempotency replays return `IDEMPOTENT_REPLAY` without re-executing,
 *  - mixed success / failure batches surface typed per-item statuses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkCancelAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-cancel-appointments.use-case';
import type { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import {
  AppointmentNotFoundError,
  AppointmentInvalidTransitionError,
} from '../../../src/modules/appointment/domain/appointment.errors';

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const APPT_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const APPT_C = 'cccccccc-0000-4000-8000-000000000003';

const actor = {
  userId: 'op-1',
  tenantId: null,
  role: 'OP' as const,
  branchId: null,
  inspectorId: null,
};

function makeMocks() {
  const executeStatusTransition = {
    execute: vi.fn().mockResolvedValue({}),
  } as unknown as ExecuteStatusTransitionUseCase;
  const idempotency: IIdempotencyService = {
    getWithHash: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  } as unknown as IIdempotencyService;
  return { executeStatusTransition, idempotency };
}

describe('BulkCancelAppointmentsUseCase', () => {
  let mocks: ReturnType<typeof makeMocks>;
  beforeEach(() => { mocks = makeMocks(); });

  it('delegates each id to ExecuteStatusTransition with CANCELLED + reason', async () => {
    const useCase = new BulkCancelAppointmentsUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      reason: 'Tenant unavailable',
      actor,
      actorTimezone: 'Australia/Sydney',
    });

    expect(mocks.executeStatusTransition.execute).toHaveBeenCalledTimes(2);
    expect(mocks.executeStatusTransition.execute).toHaveBeenCalledWith({
      appointmentId: APPT_A,
      targetStatus: 'CANCELLED',
      reason: 'Tenant unavailable',
      actor,
    });
    expect(out.results).toEqual([
      { appointmentId: APPT_A, status: 'OK' },
      { appointmentId: APPT_B, status: 'OK' },
    ]);
  });

  it('uses the actor TZ for the idempotency day key', async () => {
    const useCase = new BulkCancelAppointmentsUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T14:30:00Z'), // 2026-04-16 in Sydney
    );

    await useCase.execute({ appointmentIds: [APPT_A], reason: 'x', actor, actorTimezone: 'Australia/Sydney' });

    const [key] = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(key).toBe(`bulk_cancel:${APPT_A}:2026-04-16`);
  });

  it('returns IDEMPOTENT_REPLAY when the per-day cache exists and skips the delegate', async () => {
    (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      appointmentId: APPT_A,
      status: 'OK',
    });
    const useCase = new BulkCancelAppointmentsUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      reason: 'x',
      actor,
      actorTimezone: 'Australia/Sydney',
    });

    expect(out.results).toEqual([{ appointmentId: APPT_A, status: 'IDEMPOTENT_REPLAY' }]);
    expect(mocks.executeStatusTransition.execute).not.toHaveBeenCalled();
  });

  it('surfaces typed per-item errors and continues the batch', async () => {
    (mocks.executeStatusTransition.execute as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new AppointmentNotFoundError())
      .mockRejectedValueOnce(new AppointmentInvalidTransitionError('DONE', 'CANCELLED'));

    const useCase = new BulkCancelAppointmentsUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A, APPT_B, APPT_C],
      reason: 'reason',
      actor,
      actorTimezone: 'UTC',
    });

    expect(out.results[0]?.status).toBe('OK');
    expect(out.results[1]?.status).toBe('NOT_FOUND');
    expect(out.results[2]?.status).toBe('INVALID_TRANSITION');
    expect(out.results).toHaveLength(3);
  });

  it('persists the OK sentinel via idempotency.set so a same-day retry replays', async () => {
    const useCase = new BulkCancelAppointmentsUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      reason: 'x',
      actor,
      actorTimezone: 'Australia/Sydney',
    });

    expect(mocks.idempotency.set).toHaveBeenCalledWith(
      `bulk_cancel:${APPT_A}:2026-04-15`,
      'bulk_cancel',
      { appointmentId: APPT_A, status: 'OK' },
      36,
    );
  });
});
