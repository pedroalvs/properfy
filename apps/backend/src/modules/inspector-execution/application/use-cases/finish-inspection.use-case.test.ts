import { describe, expect, it, vi } from 'vitest';
import { FinishInspectionUseCase } from './finish-inspection.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';

const INSP_ACTOR = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

const TX = { __tx: true };

/** Mirrors join-group.use-case.test.ts: a $transaction stub that runs the callback
 * against a sentinel tx and marks commit only if the callback resolves. */
function buildPrismaStub() {
  return {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(TX)),
  };
}

function buildUseCase(overrides: {
  executionRepo?: Record<string, unknown>;
  appointmentRepo?: Record<string, unknown>;
  executeStatusTransition?: Record<string, unknown>;
  prisma?: Record<string, unknown>;
} = {}) {
  const executionRepo = overrides.executionRepo ?? {
    findByAppointmentId: vi.fn().mockResolvedValue({
      id: 'exec-1',
      appointmentId: 'apt-1',
      inspectorId: 'insp-1',
      startedAt: new Date('2026-03-23T10:00:00.000Z'),
      isFinished: () => false,
    }),
    update: vi.fn(),
  };
  const appointmentRepo = overrides.appointmentRepo ?? {
    findById: vi.fn().mockResolvedValue({
      appointment: { tenantId: 'tenant-1', serviceTypeId: null },
    }),
  };
  const executeStatusTransition = overrides.executeStatusTransition ?? {
    execute: vi.fn().mockResolvedValue({ status: 'DONE' }),
    executeInTransaction: vi.fn().mockResolvedValue({
      output: { status: 'DONE' },
      runAfterCommit: vi.fn().mockResolvedValue(undefined),
    }),
  };
  const idempotencyService = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };

  const auditService = { log: vi.fn() } as never;
  return new FinishInspectionUseCase(
    executionRepo as never,
    idempotencyService as never,
    executeStatusTransition as never,
    appointmentRepo as never,
    auditService,
    new AuthorizationService(auditService),
    (overrides.prisma ?? buildPrismaStub()) as never,
  );
}

describe('FinishInspectionUseCase', () => {
  it('rejects finishing an execution assigned to another inspector', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue({
        id: 'exec-1',
        appointmentId: 'apt-1',
        inspectorId: 'insp-2',
        startedAt: new Date('2026-03-23T10:00:00.000Z'),
        isFinished: () => false,
      }),
    };

    const auditService = { log: vi.fn() } as never;
    const useCase = new FinishInspectionUseCase(
      executionRepo as never,
      { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue({ appointment: { tenantId: 'tenant-1' } }) } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        latitude: -12.97,
        longitude: -38.5,
        idempotencyKey: 'idem-1',
        actor: INSP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('finishes with geolocation only and transitions the appointment to DONE', async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({
      appointmentId: 'apt-1',
      latitude: -12.97,
      longitude: -38.5,
      idempotencyKey: 'idem-3',
      actor: INSP_ACTOR,
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentStatus).toBe('DONE');
  });

  it('persists only finish geolocation and timestamp on the execution', async () => {
    const update = vi.fn();
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue({
        id: 'exec-1',
        appointmentId: 'apt-1',
        inspectorId: 'insp-1',
        startedAt: new Date('2026-03-23T10:00:00.000Z'),
        isFinished: () => false,
      }),
      update,
    };
    const useCase = buildUseCase({ executionRepo });

    await useCase.execute({
      appointmentId: 'apt-1',
      latitude: -12.97,
      longitude: -38.5,
      idempotencyKey: 'idem-4',
      actor: INSP_ACTOR,
    });

    expect(update).toHaveBeenCalledWith('exec-1', {
      finishedAt: expect.any(Date),
      finishLatitude: -12.97,
      finishLongitude: -38.5,
    }, TX);
  });

  it('rolls back the finishedAt persist and skips idempotency recording when the DONE transition fails (WI-4)', async () => {
    const update = vi.fn();
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue({
        id: 'exec-1',
        appointmentId: 'apt-1',
        inspectorId: 'insp-1',
        startedAt: new Date('2026-03-23T10:00:00.000Z'),
        isFinished: () => false,
      }),
      update,
    };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: { tenantId: 'tenant-1', serviceTypeId: null },
      }),
    };
    const executeStatusTransition = {
      execute: vi.fn(),
      executeInTransaction: vi.fn().mockRejectedValue(new Error('transition boom')),
    };
    const idempotencyService = { get: vi.fn().mockResolvedValue(null), set: vi.fn() };
    const auditService = { log: vi.fn() } as never;
    const prisma = buildPrismaStub();

    const useCase = new FinishInspectionUseCase(
      executionRepo as never,
      idempotencyService as never,
      executeStatusTransition as never,
      appointmentRepo as never,
      auditService,
      new AuthorizationService(auditService),
      prisma as never,
    );

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        latitude: -12.97,
        longitude: -38.5,
        idempotencyKey: 'idem-5',
        actor: INSP_ACTOR,
      }),
    ).rejects.toThrow('transition boom');

    // The execution update ran inside the same $transaction callback that threw,
    // so — with a real Postgres client — it would never be committed. This
    // asserts the composition: both writes go through the same tx handle.
    expect(update).toHaveBeenCalledWith('exec-1', expect.any(Object), TX);
    expect(idempotencyService.set).not.toHaveBeenCalled();
  });
});
