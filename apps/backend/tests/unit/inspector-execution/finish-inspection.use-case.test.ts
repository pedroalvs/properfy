import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinishInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
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
  executeInTransaction: vi.fn(),
};

const appointmentRepo = {
  findById: vi.fn(),
};

// F03-2: finish takes the appointment row lock as its first statement (deadlock-safe
// ordering with can't-do). The use case calls it even when prisma is undefined.
const fieldEventRepo = {
  lockAppointmentForFieldEvent: vi.fn().mockResolvedValue(undefined),
};

const auditService = { log: vi.fn() };

const platformSettings = { get: vi.fn() };
const FIELD_EVENTS_DEFAULTS = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG' as const,
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

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
    undefined,
    platformSettings as any,
    fieldEventRepo as any,
  );
}

describe('FinishInspectionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyService.get.mockResolvedValue(null);
    idempotencyService.set.mockResolvedValue(undefined);
    executionRepo.update.mockResolvedValue(undefined);
    platformSettings.get.mockResolvedValue({ ...FIELD_EVENTS_DEFAULTS });
    const transitionOutput = {
      id: 'appt-1',
      status: 'DONE',
      previousStatus: 'SCHEDULED',
      reason: null,
      inspectorId: 'insp-1',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      updatedAt: new Date(),
    };
    executeStatusTransition.execute.mockResolvedValue(transitionOutput);
    executeStatusTransition.executeInTransaction.mockResolvedValue({
      output: transitionOutput,
      runAfterCommit: vi.fn().mockResolvedValue(undefined),
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
      undefined,
    );

    expect(executeStatusTransition.executeInTransaction).toHaveBeenCalledWith(
      {
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        // F03-2: finish uses a compare-and-swap on the current status.
        expectedStatus: 'SCHEDULED',
        actor: inspActor,
      },
      undefined,
    );
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

    expect(executeStatusTransition.executeInTransaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
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

    expect(executeStatusTransition.executeInTransaction).toHaveBeenCalledOnce();
    expect(executeStatusTransition.executeInTransaction).toHaveBeenCalledWith(
      {
        appointmentId: 'appt-1',
        targetStatus: 'DONE',
        // F03-2: finish uses a compare-and-swap on the current status.
        expectedStatus: 'SCHEDULED',
        actor: inspActor,
      },
      undefined,
    );
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

  // --- F03: finish capture (distance, flags, accuracy, device time) ---

  const withProperty = (lat: number | null, lng: number | null) => ({
    appointment: { tenantId: 'tenant-1', serviceTypeId: 'stype-1' },
    propertyLatitude: lat,
    propertyLongitude: lng,
  });

  it('old body finishes with null accuracy/client time', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    appointmentRepo.findById.mockResolvedValue(withProperty(null, null));
    const result = await sut.execute({ appointmentId: 'appt-1', latitude: -33.8568, longitude: 151.2153, idempotencyKey: 'fin-old', actor: inspActor });
    expect(result.finishAccuracyMeters).toBeNull();
    expect(result.finishGeolocationDistanceMeters).toBeNull();
    expect(result.finishOutOfRadius).toBe(false);
    const upd = executionRepo.update.mock.calls[0][1];
    expect(upd.finishClientAt).toBeNull();
  });

  it('computes finish distance and clears the flag when within radius', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    appointmentRepo.findById.mockResolvedValue(withProperty(-33.8568, 151.2153));
    // ~80 m north of the property
    const result = await sut.execute({ appointmentId: 'appt-1', latitude: -33.85608, longitude: 151.2153, accuracy: 6, idempotencyKey: 'fin-near', actor: inspActor });
    expect(result.finishGeolocationDistanceMeters).toBeTypeOf('number');
    expect(result.finishGeolocationDistanceMeters!).toBeLessThan(300);
    expect(result.finishOutOfRadius).toBe(false);
    expect(result.finishAccuracyMeters).toBe(6);
  });

  it('flags a far finish but never blocks, and the mismatch audit carries no coordinates (phase FINISH)', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    appointmentRepo.findById.mockResolvedValue(withProperty(-33.8568, 151.2153));
    const result = await sut.execute({ appointmentId: 'appt-1', latitude: -33.81, longitude: 151.2153, accuracy: 10, idempotencyKey: 'fin-far', actor: inspActor });
    expect(result.appointmentStatus).toBe('DONE');
    expect(result.finishOutOfRadius).toBe(true);
    const mismatch = auditService.log.mock.calls.find((c: any[]) => c[0].action === 'inspection.geolocation_mismatch');
    expect(mismatch).toBeDefined();
    expect(mismatch![0].metadata.phase).toBe('FINISH');
    expect(mismatch![0].metadata.thresholdMeters).toBe(300);
    for (const k of ['latitude', 'longitude', 'inspectorLatitude', 'inspectorLongitude', 'finishLatitude', 'finishLongitude']) {
      expect(mismatch![0].metadata).not.toHaveProperty(k);
    }
  });

  it('writes the distance/flags/accuracy in the same transactional update as the finish', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    appointmentRepo.findById.mockResolvedValue(withProperty(-33.8568, 151.2153));
    await sut.execute({ appointmentId: 'appt-1', latitude: -33.81, longitude: 151.2153, accuracy: 10, idempotencyKey: 'fin-tx', actor: inspActor });
    const upd = executionRepo.update.mock.calls[0][1];
    expect(upd).toMatchObject({ finishOutOfRadius: true, finishAccuracyMeters: 10 });
    expect(upd.finishGeolocationDistanceMeters).toBeTypeOf('number');
    expect(upd.finishedAt).toBeInstanceOf(Date);
  });
});
