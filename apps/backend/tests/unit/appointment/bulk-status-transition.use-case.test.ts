/**
 * BulkStatusTransitionUseCase (025 §FR-431) — generic wrapper around
 * ExecuteStatusTransitionUseCase for the bulk-modal transitions. State
 * machine validation lives in the underlying use case; this test pins
 * the per-target idempotency-key bucketing (so flipping the target in
 * the same day still executes) and the typed error envelope.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-status-transition.use-case';
import type { ExecuteStatusTransitionUseCase } from '../../../src/modules/appointment/application/use-cases/execute-status-transition.use-case';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import {
  AppointmentInvalidTransitionError,
  AppointmentReasonRequiredError,
  AppointmentTransitionNotPermittedError,
} from '../../../src/modules/appointment/domain/appointment.errors';

const APPT_A = 'aaaaaaaa-0000-4000-8000-000000000100';
const APPT_B = 'bbbbbbbb-0000-4000-8000-000000000200';

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

describe('BulkStatusTransitionUseCase', () => {
  let mocks: ReturnType<typeof makeMocks>;
  beforeEach(() => { mocks = makeMocks(); });

  it('forwards the caller-supplied targetStatus and reason verbatim', async () => {
    const useCase = new BulkStatusTransitionUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({
      appointmentIds: [APPT_A],
      targetStatus: 'REJECTED',
      reason: 'Property inaccessible',
      actor,
    });

    expect(mocks.executeStatusTransition.execute).toHaveBeenCalledWith({
      appointmentId: APPT_A,
      targetStatus: 'REJECTED',
      reason: 'Property inaccessible',
      actor,
    });
  });

  it('idempotency key includes the targetStatus — flipping target re-executes', async () => {
    const useCase = new BulkStatusTransitionUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    await useCase.execute({ appointmentIds: [APPT_A], targetStatus: 'REJECTED', reason: 'r', actor, actorTimezone: 'Australia/Sydney' });
    await useCase.execute({ appointmentIds: [APPT_A], targetStatus: 'DRAFT', reason: 'r', actor, actorTimezone: 'Australia/Sydney' });

    const calls = (mocks.idempotency.getWithHash as ReturnType<typeof vi.fn>).mock.calls.map(([k]) => k as string);
    expect(calls[0]).toBe(`bulk_status_transition:${APPT_A}:REJECTED:2026-04-15`);
    expect(calls[1]).toBe(`bulk_status_transition:${APPT_A}:DRAFT:2026-04-15`);
  });

  it('maps AppointmentInvalidTransitionError → INVALID_TRANSITION', async () => {
    (mocks.executeStatusTransition.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AppointmentInvalidTransitionError('DRAFT', 'DONE'),
    );
    const useCase = new BulkStatusTransitionUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      targetStatus: 'DONE',
      actor,
    });

    expect(out.results[0]?.status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentReasonRequiredError → INVALID_TRANSITION', async () => {
    (mocks.executeStatusTransition.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AppointmentReasonRequiredError(),
    );
    const useCase = new BulkStatusTransitionUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A],
      targetStatus: 'REJECTED',
      actor,
    });

    expect(out.results[0]?.status).toBe('INVALID_TRANSITION');
  });

  it('maps AppointmentTransitionNotPermittedError → FORBIDDEN', async () => {
    (mocks.executeStatusTransition.execute as ReturnType<typeof vi.fn>).mockRejectedValue(
      new AppointmentTransitionNotPermittedError(),
    );
    const useCase = new BulkStatusTransitionUseCase(
      mocks.executeStatusTransition,
      mocks.idempotency,
      () => new Date('2026-04-15T12:00:00Z'),
    );

    const out = await useCase.execute({
      appointmentIds: [APPT_A, APPT_B],
      targetStatus: 'DRAFT',
      reason: 'reopen',
      actor: { ...actor, role: 'CL_USER' },
    });

    expect(out.results[0]?.status).toBe('FORBIDDEN');
    expect(out.results[1]?.status).toBe('FORBIDDEN');
  });
});
