import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAppointmentDetailUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-appointment-detail.use-case';
import type {
  IAppointmentRepository,
  AppointmentWithRelations,
} from '../../../src/modules/appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { IInspectionAssetRepository } from '../../../src/modules/inspector-execution/domain/inspection-asset.repository';
import type { IServiceTypeReader } from '../../../src/modules/inspector-execution/domain/service-type-reader';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { InspectionAssetEntity } from '../../../src/modules/inspector-execution/domain/inspection-asset.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionT1BlockedError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import type { AuthContext } from '@properfy/shared';

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: 'insp-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-03-21'),
    timeSlot: '09:00-11:00',
    keyRequired: false,
    meetingLocation: 'Front door',
    keyLocation: 'Lockbox #3',
    tenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 200,
    payoutAmount: 140,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeContact(): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: '+61400000001',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeRestriction(): AppointmentRestrictionEntity {
  return new AppointmentRestrictionEntity({
    id: 'restriction-1',
    appointmentId: 'appt-1',
    isHome: true,
    unavailableDaysJson: ['Monday'],
    unavailableHoursJson: ['08:00-09:00'],
    notes: 'Dog in backyard',
    source: 'TENANT',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  withContact = true,
  withRestrictions = true,
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: withContact ? makeContact() : null,
    restrictions: withRestrictions ? [makeRestriction()] : [],
  };
}

function makeExecution(
  overrides: Partial<ConstructorParameters<typeof InspectionExecutionEntity>[0]> = {},
): InspectionExecutionEntity {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    startLatitude: -33.8688,
    startLongitude: 151.2093,
    finishLatitude: null,
    finishLongitude: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeAsset(
  overrides: Partial<ConstructorParameters<typeof InspectionAssetEntity>[0]> = {},
): InspectionAssetEntity {
  return new InspectionAssetEntity({
    id: 'asset-1',
    appointmentId: 'appt-1',
    inspectionExecutionId: 'exec-1',
    storageKey: 'inspections/appt-1/photo-1.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024000,
    kind: 'PHOTO',
    status: 'UPLOADED',
    uploadedBy: 'insp-1',
    uploadExpiresAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

const inspActor: AuthContext = {
  userId: 'insp-1',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: 'insp-1',
};

describe('GetAppointmentDetailUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let executionRepo: IInspectionExecutionRepository;
  let assetRepo: IInspectionAssetRepository;
  let serviceTypeReader: IServiceTypeReader;
  let useCase: GetAppointmentDetailUseCase;

  beforeEach(() => {
    appointmentRepo = {
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

    executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(null),
      findByAppointmentIds: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    assetRepo = {
      findById: vi.fn(),
      findByExecutionId: vi.fn().mockResolvedValue([]),
      findUploadedByExecutionId: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };

    serviceTypeReader = {
      findById: vi.fn().mockResolvedValue({
        id: 'st-1',
        code: 'ROUTINE',
        name: 'Routine Inspection',
        flowType: 'ROUTINE',
      }),
      findByIds: vi.fn(),
    };

    useCase = new GetAppointmentDetailUseCase(
      appointmentRepo,
      executionRepo,
      assetRepo,
      serviceTypeReader,
    );
  });

  it('should return full appointment detail with contact, restrictions, execution, and assets', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());
    const execution = makeExecution();
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(execution);
    vi.mocked(assetRepo.findByExecutionId).mockResolvedValue([makeAsset()]);

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.id).toBe('appt-1');
    expect(result.status).toBe('SCHEDULED');
    expect(result.scheduledDate).toBe('2026-03-21');
    expect(result.timeSlot).toBe('09:00-11:00');
    expect(result.meetingLocation).toBe('Front door');
    expect(result.keyLocation).toBe('Lockbox #3');

    expect(result.contact).not.toBeNull();
    expect(result.contact!.tenantName).toBe('John Smith');
    expect(result.contact!.primaryEmail).toBe('john@example.com');
    expect(result.contact!.primaryPhone).toBe('+61400000000');
    expect(result.contact!.secondaryPhone).toBe('+61400000001');

    expect(result.restrictions).toHaveLength(1);
    expect(result.restrictions[0].isHome).toBe(true);
    expect(result.restrictions[0].notes).toBe('Dog in backyard');

    expect(result.execution).not.toBeNull();
    expect(result.execution!.id).toBe('exec-1');
    expect(result.execution!.status).toBe('IN_PROGRESS');
    expect(result.execution!.startLatitude).toBe(-33.8688);

    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].storageKey).toBe('inspections/appt-1/photo-1.jpg');
    expect(result.assets[0].kind).toBe('PHOTO');
    expect(result.assets[0].status).toBe('UPLOADED');
  });

  it('should return detail without execution when inspection not started', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, true, false),
    );
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(null);

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.execution).toBeNull();
    expect(result.assets).toHaveLength(0);
  });

  it('should throw ExecutionAppointmentNotFoundError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({ appointmentId: 'nonexistent', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when inspector does not match', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ inspectorId: 'other-inspector' }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when status is not SCHEDULED or DONE', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const amActor: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: amActor }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should throw ExecutionT1BlockedError for unconfirmed ROUTINE at T-1', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        tenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );
    vi.mocked(serviceTypeReader.findById).mockResolvedValue({
      id: 'st-1',
      code: 'ROUTINE',
      name: 'Routine Inspection',
      flowType: 'ROUTINE',
    });

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should throw ExecutionT1BlockedError for unconfirmed ROUTINE on the scheduled day', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        tenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should throw ExecutionT1BlockedError for ROUTINE marked UNAVAILABLE on the scheduled day', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        tenantConfirmationStatus: 'UNAVAILABLE',
        keyRequired: false,
      }),
    );

    await expect(
      useCase.execute({ appointmentId: 'appt-1', actor: inspActor }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    vi.useRealTimers();
  });

  it('should allow DONE appointment detail without T-1 check', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({
        status: 'DONE',
        scheduledDate: new Date('2026-03-21T12:00:00Z'),
        tenantConfirmationStatus: 'PENDING',
        keyRequired: false,
      }),
    );
    vi.mocked(executionRepo.findByAppointmentId).mockResolvedValue(
      makeExecution({ finishedAt: new Date('2026-03-21T11:00:00Z') }),
    );
    vi.mocked(assetRepo.findByExecutionId).mockResolvedValue([]);

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.status).toBe('DONE');
    expect(result.execution).not.toBeNull();
    expect(result.execution!.status).toBe('FINISHED');
    expect(serviceTypeReader.findById).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('should return null contact when no contact exists', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({}, false, false),
    );

    const result = await useCase.execute({ appointmentId: 'appt-1', actor: inspActor });

    expect(result.contact).toBeNull();
    expect(result.restrictions).toHaveLength(0);
  });
});
