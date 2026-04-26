import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReopenExecutionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/reopen-execution.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import {
  ExecutionNotStartedError,
  ExecutionNotFinishedError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';

function makeExecution(overrides: { finishedAt?: Date | null } = {}): InspectionExecutionEntity {
  const now = new Date();
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: now,
    finishedAt: overrides.finishedAt !== undefined ? overrides.finishedAt : new Date(),
    resumedAt: null,
    startLatitude: -33.8688,
    startLongitude: 151.2093,
    finishLatitude: null,
    finishLongitude: null,
    geolocationDistanceMeters: null,
    checklistJson: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeSut() {
  const executionRepo = {
    findByAppointmentId: vi.fn(),
    findByAppointmentIds: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    findStuckExecutions: vi.fn(),
  };

  const appointmentRepo = {
    findById: vi.fn(),
  };

  const auditService = {
    log: vi.fn(),
  } as unknown as AuditService;

  const authorizationService = new AuthorizationService(auditService);

  const useCase = new ReopenExecutionUseCase(
    executionRepo as any,
    appointmentRepo as any,
    auditService,
    authorizationService,
  );

  return { useCase, executionRepo, appointmentRepo, auditService };
}

describe('ReopenExecutionUseCase', () => {
  let sut: ReturnType<typeof makeSut>;

  beforeEach(() => {
    vi.clearAllMocks();
    sut = makeSut();
  });

  it('should reopen a finished execution for AM', async () => {
    const { useCase, executionRepo, appointmentRepo } = sut;

    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(makeExecution());
    vi.mocked(appointmentRepo.findById).mockResolvedValue({
      appointment: { tenantId: 'tenant-1' },
    });
    vi.mocked(executionRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      reason: 'Inspector needs to add missing photos',
      actor: makeActor({ role: 'AM' }),
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentId).toBe('appt-1');
    expect(result.resumedAt).toBeDefined();
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', {
      resumedAt: expect.any(Date),
      finishedAt: null,
    });
  });

  // Regression: OP must be allowed to reopen InspectionExecution per regras-negocio §9.488
  // ("reabrir serviço DONE" = AM or OP). This modifies the execution record only —
  // the appointment status stays DONE. The DONE→DRAFT state transition (AM-only per
  // state-machine §4.3) lives in execute-status-transition.use-case.ts and is NOT touched here.
  it('should reopen a finished execution for OP (regression for approved widening)', async () => {
    const { useCase, executionRepo, appointmentRepo, auditService } = sut;

    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(makeExecution());
    vi.mocked(appointmentRepo.findById).mockResolvedValue({
      appointment: { tenantId: 'tenant-1' },
    });
    vi.mocked(executionRepo.update).mockResolvedValue(undefined);

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      reason: 'Correction by operator',
      actor: makeActor({ role: 'OP', userId: 'user-op' }),
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.resumedAt).toBeDefined();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection.execution_reopened',
        actorId: 'user-op',
      }),
    );
  });

  it('should deny CL_ADMIN with ForbiddenError', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should deny INSP with ForbiddenError', async () => {
    const { useCase } = sut;

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'INSP', inspectorId: 'insp-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ExecutionNotStartedError when execution does not exist', async () => {
    const { useCase, executionRepo } = sut;

    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ExecutionNotStartedError);
  });

  it('should throw ExecutionNotFinishedError when execution is still in progress', async () => {
    const { useCase, executionRepo } = sut;

    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(
      makeExecution({ finishedAt: null }),
    );

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        reason: 'Test reason',
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toThrow(ExecutionNotFinishedError);
  });
});
