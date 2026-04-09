import { describe, expect, it, vi } from 'vitest';
import { ReopenExecutionUseCase } from './reopen-execution.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionNotStartedError,
  ExecutionNotFinishedError,
} from '../../domain/inspection-execution.errors';

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

const INSP_ACTOR = {
  userId: 'user-insp',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

function buildFinishedExecution() {
  return {
    id: 'exec-1',
    appointmentId: 'apt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-04-01T10:00:00.000Z'),
    finishedAt: new Date('2026-04-01T12:00:00.000Z'),
    resumedAt: null,
    isFinished: () => true,
    isInProgress: () => false,
  };
}

function buildInProgressExecution() {
  return {
    id: 'exec-1',
    appointmentId: 'apt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-04-01T10:00:00.000Z'),
    finishedAt: null,
    resumedAt: null,
    isFinished: () => false,
    isInProgress: () => true,
  };
}

function buildUseCase(overrides: {
  executionRepo?: Record<string, unknown>;
  appointmentRepo?: Record<string, unknown>;
  auditService?: Record<string, unknown>;
} = {}) {
  const executionRepo = overrides.executionRepo ?? {
    findByAppointmentId: vi.fn().mockResolvedValue(buildFinishedExecution()),
    update: vi.fn(),
  };
  const appointmentRepo = overrides.appointmentRepo ?? {
    findById: vi.fn().mockResolvedValue({
      appointment: { tenantId: 'tenant-1' },
    }),
  };
  const auditService = overrides.auditService ?? { log: vi.fn() };

  const authorizationService = new AuthorizationService(auditService as never);
  return {
    useCase: new ReopenExecutionUseCase(
      executionRepo as never,
      appointmentRepo as never,
      auditService as never,
      authorizationService,
    ),
    executionRepo,
    appointmentRepo,
    auditService,
  };
}

describe('ReopenExecutionUseCase', () => {
  it('AM can reopen a finished execution', async () => {
    const { useCase, executionRepo, auditService } = buildUseCase();

    const result = await useCase.execute({
      appointmentId: 'apt-1',
      reason: 'Missing photos need to be added',
      actor: AM_ACTOR,
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentId).toBe('apt-1');
    expect(result.startedAt).toBe('2026-04-01T10:00:00.000Z');
    expect(result.resumedAt).toBeDefined();

    // Verify update was called with correct params
    expect((executionRepo.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        resumedAt: expect.any(Date),
        finishedAt: null,
      }),
    );

    // Verify audit was logged
    expect((auditService.log as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection.execution_reopened',
        actorId: 'user-am',
        entityType: 'InspectionExecution',
        entityId: 'exec-1',
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          reason: 'Missing photos need to be added',
          appointmentId: 'apt-1',
        }),
      }),
    );
  });

  it('rejects non-AM actors with ForbiddenError', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        reason: 'Missing photos',
        actor: OP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects inspector actors with ForbiddenError', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        reason: 'Missing photos',
        actor: INSP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ExecutionNotStartedError when no execution exists', async () => {
    const { useCase } = buildUseCase({
      executionRepo: {
        findByAppointmentId: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        reason: 'Missing photos',
        actor: AM_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ExecutionNotStartedError);
  });

  it('throws ExecutionNotFinishedError when execution is still in progress', async () => {
    const { useCase } = buildUseCase({
      executionRepo: {
        findByAppointmentId: vi.fn().mockResolvedValue(buildInProgressExecution()),
        update: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        reason: 'Missing photos',
        actor: AM_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ExecutionNotFinishedError);
  });

  it('preserves original startedAt and sets resumedAt', async () => {
    const { useCase } = buildUseCase();

    const result = await useCase.execute({
      appointmentId: 'apt-1',
      reason: 'Missing photos',
      actor: AM_ACTOR,
    });

    // startedAt must be preserved from the original execution
    expect(result.startedAt).toBe('2026-04-01T10:00:00.000Z');
    // resumedAt must be set
    expect(new Date(result.resumedAt).getTime()).toBeGreaterThan(0);
  });

  it('clears finishedAt on reopen', async () => {
    const { useCase, executionRepo } = buildUseCase();

    await useCase.execute({
      appointmentId: 'apt-1',
      reason: 'Missing photos',
      actor: AM_ACTOR,
    });

    expect((executionRepo.update as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({ finishedAt: null }),
    );
  });

  it('audit log includes reason', async () => {
    const { useCase, auditService } = buildUseCase();

    await useCase.execute({
      appointmentId: 'apt-1',
      reason: 'Inspector forgot to take kitchen photos',
      actor: AM_ACTOR,
    });

    expect((auditService.log as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reason: 'Inspector forgot to take kitchen photos',
        }),
      }),
    );
  });
});
