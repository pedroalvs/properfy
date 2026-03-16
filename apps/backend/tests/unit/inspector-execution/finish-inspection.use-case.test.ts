import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinishInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/finish-inspection.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import {
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
  ExecutionInsufficientAssetsError,
  ExecutionAssetUploadPendingError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const assetRepo = {
  findById: vi.fn(),
  findByExecutionId: vi.fn(),
  findUploadedByExecutionId: vi.fn(),
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

const auditService = { log: vi.fn() };

const inspActor = {
  userId: 'insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
};

function makeExecution(overrides = {}) {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    startLatitude: -33.891,
    startLongitude: 151.277,
    finishLatitude: null,
    finishLongitude: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeUploadedAsset(overrides = {}) {
  return new InspectionAssetEntity({
    id: 'asset-1',
    appointmentId: 'appt-1',
    inspectionExecutionId: 'exec-1',
    storageKey: 'inspections/tenant-1/appt-1/asset-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    kind: 'PHOTO',
    status: 'UPLOADED',
    uploadedBy: 'insp-1',
    uploadExpiresAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function makeSut() {
  return new FinishInspectionUseCase(
    executionRepo,
    assetRepo,
    idempotencyService,
    executeStatusTransition as any,
    auditService as any,
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
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      updatedAt: new Date(),
    });
  });

  it('should set finishedAt and trigger SCHEDULED->DONE transition', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

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
    expect(result.assetsCount).toBe(1);

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
      assetsCount: 2,
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

  it('should throw ExecutionInsufficientAssetsError when no PHOTO asset uploaded', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    // Only a DOCUMENT asset, no PHOTO
    assetRepo.findUploadedByExecutionId.mockResolvedValue([
      makeUploadedAsset({ kind: 'DOCUMENT', id: 'asset-doc' }),
    ]);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-4',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionInsufficientAssetsError);
  });

  it('should throw ExecutionAssetUploadPendingError when referenced asset is PENDING', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

    const pendingAsset = makeUploadedAsset({ id: 'asset-pending', status: 'PENDING' });
    assetRepo.findById.mockResolvedValue(pendingAsset);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        assets: [{ assetId: 'asset-pending', storageKey: 'some-key' }],
        idempotencyKey: 'key-5',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAssetUploadPendingError);
  });

  it('should throw ExecutionAssetUploadPendingError when referenced asset not found in execution', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

    // Asset belongs to a different execution
    const otherAsset = makeUploadedAsset({
      id: 'asset-other',
      inspectionExecutionId: 'exec-other',
    });
    assetRepo.findById.mockResolvedValue(otherAsset);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        assets: [{ assetId: 'asset-other', storageKey: 'some-key' }],
        idempotencyKey: 'key-6',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAssetUploadPendingError);
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.900,
        longitude: 151.300,
        idempotencyKey: 'key-7',
        actor: { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as any, branchId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should call executeStatusTransition with DONE target and INSP actor', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

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
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

    await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.900,
      longitude: 151.300,
      idempotencyKey: 'key-9',
      actor: inspActor,
    });

    expect(auditService.log).toHaveBeenCalledOnce();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection_execution.finished',
        actorType: 'USER',
        actorId: 'insp-1',
        entityType: 'InspectionExecution',
        entityId: 'exec-1',
      }),
    );
  });

  it('should store idempotency result after finishing', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeUploadedAsset()]);

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
