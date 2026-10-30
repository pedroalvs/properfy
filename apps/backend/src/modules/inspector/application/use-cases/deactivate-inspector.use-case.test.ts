import { describe, expect, it, vi } from 'vitest';
import { DeactivateInspectorUseCase } from './deactivate-inspector.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  InspectorNotFoundError,
  InspectorAlreadyInactiveError,
} from '../../domain/inspector.errors';

const AM_ACTOR = {
  userId: 'user-am',
  tenantId: null,
  branchId: null,
  role: 'AM' as const,
  inspectorId: null,
};

const INSP_ACTOR = {
  userId: 'user-insp',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

function makeInspector(overrides: Record<string, unknown> = {}) {
  return {
    id: 'insp-1',
    name: 'John Inspector',
    email: 'john@example.com',
    phone: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    isActive: () => true,
    isDeleted: () => false,
    ...overrides,
  };
}

describe('DeactivateInspectorUseCase', () => {
  it('rejects non-AM/OP actors', async () => {
    const auditService = { log: vi.fn() } as never;
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn() } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        reason: 'No longer available',
        actor: INSP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws InspectorNotFoundError when inspector does not exist', async () => {
    const auditService = { log: vi.fn() } as never;
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn().mockResolvedValue(null) } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        reason: 'No longer available',
        actor: AM_ACTOR,
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });

  it('throws InspectorAlreadyInactiveError when already inactive', async () => {
    const auditService = { log: vi.fn() } as never;
    const useCase = new DeactivateInspectorUseCase(
      {
        findById: vi.fn().mockResolvedValue(
          makeInspector({ status: 'INACTIVE', isActive: () => false }),
        ),
      } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        reason: 'No longer available',
        actor: AM_ACTOR,
      }),
    ).rejects.toBeInstanceOf(InspectorAlreadyInactiveError);
  });

  it('throws InspectorHasOpenAppointmentsError with count and breakdown', async () => {
    const auditService = { log: vi.fn() } as never;
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn().mockResolvedValue(makeInspector()) } as never,
      {
        countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({
          total: 5,
          byStatus: { SCHEDULED: 3, AWAITING_INSPECTOR: 2 },
        }),
      } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        inspectorId: 'insp-1',
        reason: 'No longer available',
        actor: AM_ACTOR,
      }),
    ).rejects.toThrow('Cannot deactivate inspector with 5 open appointments (3 SCHEDULED, 2 AWAITING_INSPECTOR)');
  });

  it('deactivates inspector with no open appointments', async () => {
    const inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() };

    const useCase = new DeactivateInspectorUseCase(
      inspectorRepo as never,
      {
        countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({
          total: 0,
          byStatus: {},
        }),
      } as never,
      auditService as never,
      new AuthorizationService(auditService as never),
    );

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      reason: 'Leaving the platform',
      actor: AM_ACTOR,
    });

    expect(result.id).toBe('insp-1');
    expect(result.status).toBe('INACTIVE');
    expect(inspectorRepo.update).toHaveBeenCalledWith('insp-1', { status: 'INACTIVE' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspector.deactivated',
        reason: 'Leaving the platform',
      }),
    );
  });

  it('OP role can also deactivate inspector', async () => {
    const opActor = { ...AM_ACTOR, role: 'OP' as const };
    const inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      update: vi.fn(),
    };

    const auditService = { log: vi.fn() } as never;
    const useCase = new DeactivateInspectorUseCase(
      inspectorRepo as never,
      {
        countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({
          total: 0,
          byStatus: {},
        }),
      } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      reason: 'Leaving',
      actor: opActor,
    });

    expect(result.status).toBe('INACTIVE');
  });
});

describe('DeactivateInspectorUseCase — push revocation (F02-1 L-F02-11)', () => {
  function makeUseCase(pushRepo: { revokeAllForInspector: ReturnType<typeof vi.fn> }, open = 0) {
    const auditService = { log: vi.fn() } as never;
    const inspectorRepo = {
      findById: vi.fn().mockResolvedValue(makeInspector()),
      update: vi.fn().mockResolvedValue(undefined),
    } as never;
    const checker = {
      countOpenAppointmentsForInspector: vi
        .fn()
        .mockResolvedValue({ total: open, byStatus: {} }),
    } as never;
    const useCase = new DeactivateInspectorUseCase(
      inspectorRepo,
      checker,
      auditService,
      new AuthorizationService(auditService),
      undefined,
      pushRepo as never,
    );
    return useCase;
  }

  it('revokes active subscriptions as DEACTIVATED on a successful deactivation', async () => {
    const pushRepo = { revokeAllForInspector: vi.fn().mockResolvedValue(undefined) };
    const useCase = makeUseCase(pushRepo);
    await useCase.execute({ inspectorId: 'insp-1', reason: 'No longer available', actor: AM_ACTOR });
    expect(pushRepo.revokeAllForInspector).toHaveBeenCalledTimes(1);
    expect(pushRepo.revokeAllForInspector).toHaveBeenCalledWith('insp-1', 'DEACTIVATED', expect.any(Date));
  });

  it('does not revoke subscriptions when a precondition fails (open appointments)', async () => {
    const pushRepo = { revokeAllForInspector: vi.fn().mockResolvedValue(undefined) };
    const useCase = makeUseCase(pushRepo, 2);
    await expect(
      useCase.execute({ inspectorId: 'insp-1', reason: 'x', actor: AM_ACTOR }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_HAS_OPEN_APPOINTMENTS' });
    expect(pushRepo.revokeAllForInspector).not.toHaveBeenCalled();
  });
});
