import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinishInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
  ExecutionEmptyChecklistError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const idempotencyService = {
  get: vi.fn(),
  set: vi.fn(),
};

const executeStatusTransition = {
  execute: vi.fn(),
};

const appointmentRepo = {
  findById: vi.fn(),
};

const auditService = { log: vi.fn() };

const inspActor = {
  userId: 'insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
  inspectorId: 'insp-1',
};

function makeExecution(overrides = {}) {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    resumedAt: null,
    startLatitude: -33.891,
    startLongitude: 151.277,
    finishLatitude: null,
    finishLongitude: null,
    geolocationDistanceMeters: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeSut() {
  const authorizationService = new AuthorizationService(auditService as any);
  return new FinishInspectionUseCase(
    executionRepo,
    idempotencyService,
    executeStatusTransition as any,
    appointmentRepo as any,
    auditService as any,
    authorizationService,
  );
}

describe('FinishInspectionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyService.get.mockResolvedValue(null);
    idempotencyService.set.mockResolvedValue(undefined);
    executionRepo.update.mockResolvedValue(undefined);
    executeStatusTransition.execute.mockResolvedValue({
      id: 'appt-1',
      status: 'DONE',
      previousStatus: 'SCHEDULED',
      reason: null,
      inspectorId: 'insp-1',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      updatedAt: new Date(),
    });
    appointmentRepo.findById.mockResolvedValue({
      appointment: {
        tenantId: 'tenant-1',
        serviceTypeId: 'stype-1',
      },
    });
  });

  it('should set finishedAt and trigger SCHEDULED->DONE transition', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-1',
      actor: inspActor,
    });

    expect(result.appointmentStatus).toBe('DONE');
    expect(result.finishedAt).toBeDefined();
    expect(result.executionId).toBe('exec-1');

    expect(executionRepo.update).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        finishLatitude: -33.900,
        finishLongitude: 151.300,
      }),
    );

    expect(executeStatusTransition.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: inspActor,
    });
  });

  it('should return cached response when same idempotency key is used', async () => {
    const sut = makeSut();
    const cachedOutput = {
      executionId: 'exec-cached',
      appointmentId: 'appt-1',
      startedAt: '2026-03-21T09:00:00.000Z',
      finishedAt: '2026-03-21T10:00:00.000Z',
      appointmentStatus: 'DONE',
    };
    idempotencyService.get.mockResolvedValue(cachedOutput);

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-cached',
      actor: inspActor,
    });

    expect(result).toEqual(cachedOutput);
    expect(executionRepo.findByAppointmentId).not.toHaveBeenCalled();
    expect(executionRepo.update).not.toHaveBeenCalled();
  });

  it('should throw ExecutionNotStartedError when no execution record exists', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(null);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-2',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionNotStartedError);
  });

  it('should throw ExecutionAlreadyFinishedError when execution already finished', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(
      makeExecution({ finishedAt: new Date('2026-03-21T10:00:00Z') }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-3',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAlreadyFinishedError);
  });

  it('should throw ExecutionAppointmentNotFoundError when appointment lookup returns null', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-missing-appointment',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);

    expect(executeStatusTransition.execute).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should throw ExecutionEmptyChecklistError when checklist is provided but empty', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        checklistJson: {},
        idempotencyKey: 'key-4',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionEmptyChecklistError);
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-7',
        actor: { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as any, branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should call executeStatusTransition with DONE target and INSP actor', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-8',
      actor: inspActor,
    });

    expect(executeStatusTransition.execute).toHaveBeenCalledOnce();
    expect(executeStatusTransition.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      targetStatus: 'DONE',
      actor: inspActor,
    });
  });

  it('should call audit log after finishing execution', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-9',
      actor: inspActor,
    });

    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection_execution.finished',
        actorType: 'USER',
        actorId: 'insp-1',
        entityType: 'InspectionExecution',
        entityId: 'exec-1',
        tenantId: 'tenant-1',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection.finished',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should store idempotency result after finishing', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-10',
      actor: inspActor,
    });

    expect(idempotencyService.set).toHaveBeenCalledOnce();
    expect(idempotencyService.set).toHaveBeenCalledWith('key-10', 'finish', result, 24);
  });
});
