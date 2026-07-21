import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkCrossCheckDoneUseCase } from '../../../src/modules/appointment/application/use-cases/bulk-cross-check-done.use-case';
import type { PerformCrossCheckUseCase } from '../../../src/modules/appointment/application/use-cases/perform-cross-check.use-case';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
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
  let useCase: BulkCrossCheckDoneUseCase;

  beforeEach(() => {
    performCrossCheck = { execute: vi.fn() };
    const auditService = { log: vi.fn() } as unknown as AuditService;
    authorizationService = new AuthorizationService(auditService);
    useCase = new BulkCrossCheckDoneUseCase(
      performCrossCheck as unknown as PerformCrossCheckUseCase,
      authorizationService,
    );
  });

  it('cross-checks all DONE+unchecked appointments (happy path)', async () => {
    performCrossCheck.execute.mockResolvedValue({ id: 'x' });

    const result = await useCase.execute({ ids: ['a', 'b', 'c'], actor: makeActor() });

    expect(result.updated).toBe(3);
    expect(result.failed).toEqual([]);
    expect(performCrossCheck.execute).toHaveBeenCalledTimes(3);
    expect(performCrossCheck.execute).toHaveBeenCalledWith({ appointmentId: 'a', actor: expect.any(Object) });
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

  it('does not abort the batch when one item throws a non-domain error', async () => {
    performCrossCheck.execute
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 'b' });

    const result = await useCase.execute({ ids: ['a', 'b'], actor: makeActor() });

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([{ id: 'a', code: 'INTERNAL_ERROR', message: 'boom' }]);
  });

  it('denies non-AM/OP actors up front without calling the inner use case', async () => {
    await expect(
      useCase.execute({ ids: ['a'], actor: makeActor({ role: 'CL_ADMIN' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(performCrossCheck.execute).not.toHaveBeenCalled();
  });
});
