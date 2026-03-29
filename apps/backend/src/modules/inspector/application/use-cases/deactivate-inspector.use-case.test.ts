import { describe, expect, it, vi } from 'vitest';
import { DeactivateInspectorUseCase } from './deactivate-inspector.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import {
  InspectorNotFoundError,
  InspectorAlreadyInactiveError,
  InspectorHasOpenAppointmentsError,
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
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn() } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      { log: vi.fn() } as never,
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
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn().mockResolvedValue(null) } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      { log: vi.fn() } as never,
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
    const useCase = new DeactivateInspectorUseCase(
      {
        findById: vi.fn().mockResolvedValue(
          makeInspector({ status: 'INACTIVE', isActive: () => false }),
        ),
      } as never,
      { countOpenAppointmentsForInspector: vi.fn() } as never,
      { log: vi.fn() } as never,
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
    const useCase = new DeactivateInspectorUseCase(
      { findById: vi.fn().mockResolvedValue(makeInspector()) } as never,
      {
        countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({
          total: 5,
          byStatus: { SCHEDULED: 3, AWAITING_INSPECTOR: 2 },
        }),
      } as never,
      { log: vi.fn() } as never,
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

    const useCase = new DeactivateInspectorUseCase(
      inspectorRepo as never,
      {
        countOpenAppointmentsForInspector: vi.fn().mockResolvedValue({
          total: 0,
          byStatus: {},
        }),
      } as never,
      { log: vi.fn() } as never,
    );

    const result = await useCase.execute({
      inspectorId: 'insp-1',
      reason: 'Leaving',
      actor: opActor,
    });

    expect(result.status).toBe('INACTIVE');
  });
});
