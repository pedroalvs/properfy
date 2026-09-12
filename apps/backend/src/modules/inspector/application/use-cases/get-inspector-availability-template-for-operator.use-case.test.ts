import { describe, expect, it, vi } from 'vitest';
import { GetInspectorAvailabilityTemplateForOperatorUseCase } from './get-inspector-availability-template-for-operator.use-case';
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';

const AM_ACTOR = {
  userId: 'user-am',
  tenantId: null,
  branchId: null,
  role: 'AM' as const,
  inspectorId: null,
};

const OP_ACTOR = {
  userId: 'user-op',
  tenantId: null,
  branchId: null,
  role: 'OP' as const,
  inspectorId: null,
};

const CL_ADMIN_ACTOR = {
  userId: 'user-cladmin',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'CL_ADMIN' as const,
  inspectorId: null,
};

const INSP_ACTOR = {
  userId: 'user-insp',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

function makeInspectorRepo(overrides: Record<string, unknown> = {}) {
  return {
    findById: vi.fn().mockResolvedValue({ id: 'insp-1' }),
    getAvailabilityTemplate: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeSlotRepo(overrides: Record<string, unknown> = {}) {
  return {
    findSlotsForRegeneration: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeUseCase(inspectorRepo: ReturnType<typeof makeInspectorRepo>, slotRepo: ReturnType<typeof makeSlotRepo>) {
  const auditService = { log: vi.fn() } as never;
  return new GetInspectorAvailabilityTemplateForOperatorUseCase(
    inspectorRepo as never,
    slotRepo as never,
    new AuthorizationService(auditService),
  );
}

describe('GetInspectorAvailabilityTemplateForOperatorUseCase', () => {
  it('rejects CL_ADMIN before any repo call', async () => {
    const inspectorRepo = makeInspectorRepo();
    const slotRepo = makeSlotRepo();
    const useCase = makeUseCase(inspectorRepo, slotRepo);

    await expect(
      useCase.execute({ inspectorId: 'insp-1', actor: CL_ADMIN_ACTOR }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(inspectorRepo.findById).not.toHaveBeenCalled();
  });

  it('rejects INSP before any repo call', async () => {
    const inspectorRepo = makeInspectorRepo();
    const slotRepo = makeSlotRepo();
    const useCase = makeUseCase(inspectorRepo, slotRepo);

    await expect(
      useCase.execute({ inspectorId: 'insp-1', actor: INSP_ACTOR }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(inspectorRepo.findById).not.toHaveBeenCalled();
  });

  it('allows AM through to the repo lookup', async () => {
    const inspectorRepo = makeInspectorRepo();
    const slotRepo = makeSlotRepo();
    const useCase = makeUseCase(inspectorRepo, slotRepo);

    await useCase.execute({ inspectorId: 'insp-1', actor: AM_ACTOR });

    expect(inspectorRepo.findById).toHaveBeenCalledWith('insp-1');
  });

  it('allows OP through to the repo lookup', async () => {
    const inspectorRepo = makeInspectorRepo();
    const slotRepo = makeSlotRepo();
    const useCase = makeUseCase(inspectorRepo, slotRepo);

    await useCase.execute({ inspectorId: 'insp-1', actor: OP_ACTOR });

    expect(inspectorRepo.findById).toHaveBeenCalledWith('insp-1');
  });

  it('still throws NotFoundError when the inspector does not exist, after the RBAC check', async () => {
    const inspectorRepo = makeInspectorRepo({ findById: vi.fn().mockResolvedValue(null) });
    const slotRepo = makeSlotRepo();
    const useCase = makeUseCase(inspectorRepo, slotRepo);

    await expect(
      useCase.execute({ inspectorId: 'missing', actor: AM_ACTOR }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
