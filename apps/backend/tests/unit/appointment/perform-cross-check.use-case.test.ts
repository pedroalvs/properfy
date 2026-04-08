import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { PerformCrossCheckUseCase } from '../../../src/modules/appointment/application/use-cases/perform-cross-check.use-case';
import {
  AppointmentDoneCrossCheckAlreadyCompletedError,
  AppointmentDoneCrossCheckEvidenceIncompleteError,
  AppointmentDoneCrossCheckInvalidStatusError,
  AppointmentDoneCrossCheckNotPermittedError,
  AppointmentDoneCrossCheckSelfApprovalError,
} from '../../../src/modules/appointment/domain/appointment.errors';
import { AuditLogEntity } from '../../../src/modules/audit/domain/audit-log.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'service-type-1',
    inspectorId: 'insp-1',
    status: 'DONE',
    scheduledDate: new Date('2026-04-15T00:00:00Z'),
    timeSlot: 'MORNING',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 100,
    payoutAmount: 70,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'creator-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  });
}

function makeExecution(overrides: Partial<ConstructorParameters<typeof InspectionExecutionEntity>[0]> = {}) {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-04-15T09:00:00Z'),
    finishedAt: new Date('2026-04-15T09:30:00Z'),
    startLatitude: -1,
    startLongitude: -1,
    finishLatitude: -1,
    finishLongitude: -1,
    checklistJson: {},
    notes: null,
    createdAt: new Date('2026-04-15T09:00:00Z'),
    updatedAt: new Date('2026-04-15T09:30:00Z'),
    ...overrides,
  });
}

function makeAsset(overrides: Partial<ConstructorParameters<typeof InspectionAssetEntity>[0]> = {}) {
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
    createdAt: new Date('2026-04-15T09:10:00Z'),
    ...overrides,
  });
}

function makeDoneAudit(actorId: string) {
  return new AuditLogEntity({
    id: 'audit-1',
    tenantId: 'tenant-1',
    actorType: 'USER',
    actorId,
    entityType: 'Appointment',
    entityId: 'appt-1',
    action: 'appointment.status_transition',
    reason: null,
    beforeJson: { status: 'SCHEDULED' },
    afterJson: { status: 'DONE' },
    requestId: null,
    ipAddress: null,
    metadataJson: null,
    createdAt: new Date('2026-04-15T09:31:00Z'),
  });
}

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
};

const auditLogRepo = {
  save: vi.fn(),
  saveMany: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
};

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  findStuckExecutions: vi.fn(),
};

const assetRepo = {
  findById: vi.fn(),
  findByExecutionId: vi.fn(),
  findUploadedByExecutionId: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  expirePendingAssets: vi.fn(),
};

const auditService = {
  log: vi.fn(),
};

const serviceTypeReader = {
  findById: vi.fn(),
};

const onDoneHandler = {
  execute: vi.fn().mockResolvedValue(undefined),
};

function makeSut() {
  return new PerformCrossCheckUseCase(
    appointmentRepo as never,
    auditLogRepo as never,
    executionRepo as never,
    assetRepo as never,
    auditService as never,
    serviceTypeReader as never,
    onDoneHandler,
  );
}

describe('PerformCrossCheckUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });
    auditLogRepo.findAll.mockResolvedValue([makeDoneAudit('done-by-1')]);
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());
    assetRepo.findUploadedByExecutionId.mockResolvedValue([makeAsset()]);
    serviceTypeReader.findById.mockResolvedValue(null);
    appointmentRepo.update.mockResolvedValue(undefined);
  });

  it('cross-checks a DONE appointment and triggers financial side effects', async () => {
    const sut = makeSut();

    const result = await sut.execute({
      appointmentId: 'appt-1',
      actor: {
        userId: 'op-1',
        tenantId: null,
        role: 'OP',
        branchId: null,
        inspectorId: null,
      },
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        doneCheckedByUserId: 'op-1',
        doneCheckedAt: expect.any(Date),
      }),
    );
    expect(onDoneHandler.execute).toHaveBeenCalledWith({ appointmentId: 'appt-1' });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.done_checked',
        actorId: 'op-1',
      }),
    );
    expect(result.status).toBe('DONE');
    expect(result.previousStatus).toBe('DONE');
    expect(result.doneCheckedByUserId).toBe('op-1');
  });

  it('rejects cross-check when appointment is not DONE', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'SCHEDULED' }),
      contact: null,
      restrictions: [],
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'op-1',
          tenantId: null,
          role: 'OP',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckInvalidStatusError);
  });

  it('rejects when appointment was already cross-checked', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({
        doneCheckedByUserId: 'op-1',
        doneCheckedAt: new Date('2026-04-15T09:40:00Z'),
      }),
      contact: null,
      restrictions: [],
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'op-2',
          tenantId: null,
          role: 'OP',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckAlreadyCompletedError);
  });

  it('rejects self-approval when the same user marked DONE', async () => {
    auditLogRepo.findAll.mockResolvedValue([makeDoneAudit('op-1')]);
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'op-1',
          tenantId: null,
          role: 'OP',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckSelfApprovalError);
  });

  it('rejects actors outside OP/AM', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'cl-admin-1',
          tenantId: 'tenant-1',
          role: 'CL_ADMIN',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckNotPermittedError);
  });

  it('rejects when finished execution evidence is missing', async () => {
    executionRepo.findByAppointmentId.mockResolvedValue(null);
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'op-1',
          tenantId: null,
          role: 'OP',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckEvidenceIncompleteError);
  });

  it('uses doneMarkedByUserId from column and skips audit scan', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ doneMarkedByUserId: 'done-by-1' }),
      contact: null,
      restrictions: [],
    });
    const sut = makeSut();

    const result = await sut.execute({
      appointmentId: 'appt-1',
      actor: {
        userId: 'op-1',
        tenantId: null,
        role: 'OP',
        branchId: null,
        inspectorId: null,
      },
    });

    expect(auditLogRepo.findAll).not.toHaveBeenCalled();
    expect(result.doneCheckedByUserId).toBe('op-1');
    expect(appointmentRepo.update).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.objectContaining({
        doneCheckedByUserId: 'op-1',
        doneCheckedAt: expect.any(Date),
      }),
    );
  });

  it('falls back to audit scan when doneMarkedByUserId is null', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ doneMarkedByUserId: null }),
      contact: null,
      restrictions: [],
    });
    auditLogRepo.findAll.mockResolvedValue([makeDoneAudit('done-by-1')]);
    const sut = makeSut();

    const result = await sut.execute({
      appointmentId: 'appt-1',
      actor: {
        userId: 'op-1',
        tenantId: null,
        role: 'OP',
        branchId: null,
        inspectorId: null,
      },
    });

    expect(auditLogRepo.findAll).toHaveBeenCalled();
    expect(result.doneCheckedByUserId).toBe('op-1');
  });

  it('rejects self-approval when doneMarkedByUserId matches actor', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ doneMarkedByUserId: 'op-1' }),
      contact: null,
      restrictions: [],
    });
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        actor: {
          userId: 'op-1',
          tenantId: null,
          role: 'OP',
          branchId: null,
          inspectorId: null,
        },
      }),
    ).rejects.toThrow(AppointmentDoneCrossCheckSelfApprovalError);

    expect(auditLogRepo.findAll).not.toHaveBeenCalled();
  });
});
