import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkCrossCheckDoneUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-cross-check-done.use-case';
import type { PerformCrossCheckUseCase } from '../../../src/modules/appointment/application/use-cases/perform-cross-check.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../src/shared/domain/idempotency.service';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AppointmentDoneCrossCheckInvalidStatusError } from '../../../src/modules/appointment/domain/appointment.errors';
import type { AuthContext } from '@properfy/shared';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-op',
    tenantId: 'tenant-1',
    role: 'OP',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('BulkCrossCheckDoneUseCase', () => {
  let performCrossCheck: { execute: ReturnType<typeof vi.fn> };
  let authorizationService: AuthorizationService;
  let idempotency: { getWithHash: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let logger: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let useCase: BulkCrossCheckDoneUseCase;

  beforeEach(() => {
    performCrossCheck = { execute: vi.fn() };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    // No prior idempotency record by default → every id is attempted.
    idempotency = { getWithHash: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined), get: vi.fn() };
    logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };
    useCase = new BulkCrossCheckDoneUseCase(
      performCrossCheck as unknown as PerformCrossCheckUseCase,
      authorizationService,
      idempotency as unknown as IIdempotencyService,
      logger as unknown as Logger,
    );
  });

  it('cross-checks all DONE+unchecked appointments (happy path)', async () => {
    performCrossCheck.execute.mockResolvedValue({ id: 'x' });

    const result = await useCase.execute({ ids: ['a', 'b', 'c'], actor: makeActor() });

    expect(result.updated).toBe(3);
    expect(result.failed).toEqual([]);
    expect(performCrossCheck.execute).toHaveBeenCalledTimes(3);
    expect(performCrossCheck.execute).toHaveBeenCalledWith({ appointmentId: 'a', actor: expect.any(Object) });
    // Each success reserves its per-item idempotency key.
    expect(idempotency.set).toHaveBeenCalledTimes(3);
  });

  it('treats a cached idempotency hit as updated without re-invoking the inner use case', async () => {
    // 'b' already cross-checked in this window → replay, no delegation.
    idempotency.getWithHash.mockImplementation(async (key: string) =>
      key.includes(':b:') ? { response: { ok: true }, payloadHash: null } : null,
    );
    performCrossCheck.execute.mockResolvedValue({ id: 'x' });

    const result = await useCase.execute({ ids: ['a', 'b', 'c'], actor: makeActor() });

    expect(result.updated).toBe(3);
    expect(result.failed).toEqual([]);
    // Only 'a' and 'c' hit the inner use case; 'b' was a cached replay.
    expect(performCrossCheck.execute).toHaveBeenCalledTimes(2);
    expect(performCrossCheck.execute).not.toHaveBeenCalledWith({ appointmentId: 'b', actor: expect.any(Object) });
  });

  it('does not reserve an idempotency key for a failed cross-check', async () => {
    performCrossCheck.execute.mockRejectedValue(new AppointmentDoneCrossCheckInvalidStatusError('SCHEDULED'));

    await useCase.execute({ ids: ['a'], actor: makeActor() });

    expect(idempotency.set).not.toHaveBeenCalled();
  });

  it('skips non-DONE appointments into failed[] with the invalid-status code', async () => {
    performCrossCheck.execute
      .mockResolvedValueOnce({ id: 'a' })
      .mockRejectedValueOnce(new AppointmentDoneCrossCheckInvalidStatusError('SCHEDULED'))
      .mockResolvedValueOnce({ id: 'c' });

    const result = await useCase.execute({ ids: ['a', 'b', 'c'], actor: makeActor() });

    expect(result.updated).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toEqual({
      id: 'b',
      code: 'APPOINTMENT_DONE_CROSS_CHECK_INVALID_STATUS',
      message: expect.stringContaining('DONE'),
    });
  });

  it('sanitizes non-domain errors: generic message + server-side log, batch continues', async () => {
    performCrossCheck.execute
      .mockRejectedValueOnce(new Error('boom: secret internal detail'))
      .mockResolvedValueOnce({ id: 'b' });

    const result = await useCase.execute({ ids: ['a', 'b'], actor: makeActor() });

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([
      { id: 'a', code: 'INTERNAL_ERROR', message: 'Unexpected error while processing this appointment' },
    ]);
    // Raw error is logged server-side (not leaked into the response).
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'a' }),
      expect.any(String),
    );
  });

  it('denies non-AM/OP actors up front without calling the inner use case', async () => {
    await expect(
      useCase.execute({ ids: ['a'], actor: makeActor({ role: 'CL_ADMIN' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(performCrossCheck.execute).not.toHaveBeenCalled();
  });
});
