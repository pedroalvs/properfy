import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RescheduleRequestUseCase,
  type RescheduleRequestInput,
} from '../../../src/modules/tenant-portal/application/use-cases/reschedule-request.use-case';
import type { ITenantPortalActivityRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-activity.repository';
import type { ITenantPortalTokenRepository } from '../../../src/modules/tenant-portal/domain/tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { PortalActionBlockedError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';
import { PortalAppointmentInactiveError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';
import { PortalRescheduleNotAllowedError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';
import { PortalRescheduleWindowExceededError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';
import { PortalDateInPastError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';
import { PortalInspectionInProgressError } from '../../../src/modules/tenant-portal/domain/tenant-portal.errors';

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'stype-1',
    inspectorId: 'inspector-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-15'),
    timeSlot: 'MORNING',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 70,
    pricingRuleSnapshotJson: {},
    notes: null,
    customFieldsJson: null,
    reason: null,
    createdByUserId: 'user-1',
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    createdAt: new Date('2026-04-01'),
    updatedAt: new Date('2026-04-01'),
    deletedAt: null,
    ...overrides,
  });
}

function makeServiceType(overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {}) {
  return new ServiceTypeEntity({
    id: 'stype-1',
    code: 'ROUTINE',
    name: 'Routine Inspection',
    flowType: 'ROUTINE',
    requiresTenantConfirmation: true,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function makeInput(overrides: Partial<RescheduleRequestInput> = {}): RescheduleRequestInput {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    newDate: '2026-04-20',
    newTimeSlot: 'AFTERNOON',
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

describe('RescheduleRequestUseCase', () => {
  let activityRepo: {
    save: ReturnType<typeof vi.fn>;
    findLatestByTokenAndAction: ReturnType<typeof vi.fn>;
  };
  let tokenRepo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByAppointmentId: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    updateLastAccessedAt: ReturnType<typeof vi.fn>;
    revokeAllForAppointment: ReturnType<typeof vi.fn>;
    expireActiveTokens: ReturnType<typeof vi.fn>;
  };
  let appointmentRepo: {
    findById: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteRestrictionsByAppointmentId: ReturnType<typeof vi.fn>;
    saveRestriction: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    saveContact: ReturnType<typeof vi.fn>;
    updateContact: ReturnType<typeof vi.fn>;
  };
  let serviceTypeRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByCode: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let executionRepo: { findByAppointmentId: ReturnType<typeof vi.fn> };
  let useCase: RescheduleRequestUseCase;

  beforeEach(() => {
    activityRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
    };
    tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      expireActiveTokens: vi.fn(),
    };
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact: null,
        restrictions: [],
      }),
      update: vi.fn().mockResolvedValue(undefined),
      deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
      findScheduledOnDate: vi.fn(),
      saveRestriction: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
    };
    serviceTypeRepo = {
      findById: vi.fn().mockResolvedValue(makeServiceType()),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() };
    executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };

    useCase = new RescheduleRequestUseCase(
      activityRepo as unknown as ITenantPortalActivityRepository,
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      serviceTypeRepo as unknown as IServiceTypeRepository,
      executionRepo as unknown as IInspectionExecutionRepository,
      auditService as unknown as PersistentAuditService,
    );
  });

  it('should reschedule successfully, updating date, timeSlot and resetting confirmation to PENDING', async () => {
    const result = await useCase.execute(makeInput());

    expect(result).toEqual({
      scheduledDate: '2026-04-20',
      timeSlot: 'AFTERNOON',
      tenantConfirmationStatus: 'PENDING',
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      scheduledDate: new Date('2026-04-20'),
      timeSlot: 'AFTERNOON',
      tenantConfirmationStatus: 'PENDING',
    });
    expect(tokenRepo.revokeAllForAppointment).toHaveBeenCalledWith('appt-1');
  });

  it('should throw PortalActionBlockedError when isReadOnly is true', async () => {
    await expect(useCase.execute(makeInput({ isReadOnly: true }))).rejects.toThrow(
      PortalActionBlockedError,
    );

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw PortalRescheduleNotAllowedError for non-ROUTINE service type', async () => {
    serviceTypeRepo.findById.mockResolvedValue(
      makeServiceType({ flowType: 'INGOING' as 'ROUTINE' }),
    );

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalRescheduleNotAllowedError);
  });

  it('should throw PortalRescheduleWindowExceededError when newDate is more than 30 days from original', async () => {
    await expect(
      useCase.execute(makeInput({ newDate: '2026-06-15' })),
    ).rejects.toThrow(PortalRescheduleWindowExceededError);
  });

  it('should throw PortalDateInPastError when newDate is in the past', async () => {
    await expect(
      useCase.execute(makeInput({ newDate: '2020-01-01' })),
    ).rejects.toThrow(PortalDateInPastError);
  });

  it('should throw PortalAppointmentInactiveError for CANCELLED appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'CANCELLED' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for DONE appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'DONE' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for REJECTED appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'REJECTED' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should record RESCHEDULE activity with previous and new values', async () => {
    await useCase.execute(makeInput());

    expect(activityRepo.save).toHaveBeenCalledTimes(1);
    const savedActivity = activityRepo.save.mock.calls[0][0];
    expect(savedActivity.action).toBe('RESCHEDULE');
    expect(savedActivity.previousValuesJson).toEqual({
      scheduledDate: expect.any(String),
      timeSlot: 'MORNING',
      tenantConfirmationStatus: 'PENDING',
    });
    expect(savedActivity.newValuesJson).toEqual({
      scheduledDate: '2026-04-20',
      timeSlot: 'AFTERNOON',
      tenantConfirmationStatus: 'PENDING',
    });
    expect(savedActivity.ipAddress).toBe('127.0.0.1');
    expect(savedActivity.userAgent).toBe('TestAgent/1.0');
  });

  it('should save restrictions when provided', async () => {
    const restrictions = {
      isHome: true,
      unavailableDaysJson: ['2026-04-21'],
      unavailableHoursJson: ['08:00-10:00'],
      notes: 'Dog at home',
    };

    await useCase.execute(makeInput({ restrictions }));

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalledTimes(1);
    const savedRestriction = appointmentRepo.saveRestriction.mock.calls[0][0];
    expect(savedRestriction.isHome).toBe(true);
    expect(savedRestriction.unavailableDaysJson).toEqual(['2026-04-21']);
    expect(savedRestriction.source).toBe('TENANT_PORTAL');
  });

  it('should not save restrictions when not provided', async () => {
    await useCase.execute(makeInput());

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).not.toHaveBeenCalled();
    expect(appointmentRepo.saveRestriction).not.toHaveBeenCalled();
  });

  it('should call audit service with ANONYMOUS actor type', async () => {
    await useCase.execute(makeInput());

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_portal.appointment_rescheduled',
        actorType: 'ANONYMOUS',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should throw NotFoundError when appointment does not exist', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow('Appointment not found');
  });

  it('should throw PortalInspectionInProgressError when inspection is actively in progress', async () => {
    const activeExecution = new InspectionExecutionEntity({
      id: 'exec-1',
      appointmentId: 'appt-1',
      inspectorId: 'inspector-1',
      startedAt: new Date(),
      finishedAt: null,
      startLatitude: -33.8,
      startLongitude: 151.2,
      finishLatitude: null,
      finishLongitude: null,
      checklistJson: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(activeExecution);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalInspectionInProgressError);
  });

  it('should allow reschedule when execution is finished', async () => {
    const finishedExecution = new InspectionExecutionEntity({
      id: 'exec-1',
      appointmentId: 'appt-1',
      inspectorId: 'inspector-1',
      startedAt: new Date(),
      finishedAt: new Date(),
      startLatitude: -33.8,
      startLongitude: 151.2,
      finishLatitude: -33.8,
      finishLongitude: 151.2,
      checklistJson: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(finishedExecution);

    const result = await useCase.execute(makeInput());
    expect(result.tenantConfirmationStatus).toBe('PENDING');
  });
});

describe('RescheduleRequestUseCase – onNotificationHandler', () => {
  let onNotificationHandler: { execute: ReturnType<typeof vi.fn> };

  function makeUseCaseWithHandler() {
    const activityRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
    };
    const tokenRepo = {
      findByTokenHash: vi.fn(),
      findActiveByAppointmentId: vi.fn(),
      save: vi.fn(),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      expireActiveTokens: vi.fn(),
    };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact: null,
        restrictions: [],
      }),
      update: vi.fn().mockResolvedValue(undefined),
      deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
      findScheduledOnDate: vi.fn(),
      saveRestriction: vi.fn().mockResolvedValue(undefined),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
    };
    const serviceTypeRepo = {
      findById: vi.fn().mockResolvedValue(makeServiceType()),
      findByCode: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    onNotificationHandler = {
      execute: vi.fn().mockResolvedValue(undefined),
    };

    return {
      useCase: new RescheduleRequestUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        tokenRepo as unknown as ITenantPortalTokenRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        serviceTypeRepo as unknown as IServiceTypeRepository,
        executionRepo as unknown as IInspectionExecutionRepository,
        auditService as unknown as PersistentAuditService,
        onNotificationHandler,
      ),
      useCaseWithout: new RescheduleRequestUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        tokenRepo as unknown as ITenantPortalTokenRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        serviceTypeRepo as unknown as IServiceTypeRepository,
        executionRepo as unknown as IInspectionExecutionRepository,
        auditService as unknown as PersistentAuditService,
      ),
      onNotificationHandler,
    };
  }

  it('calls onNotificationHandler with RESCHEDULE action after reschedule', async () => {
    const { useCase, onNotificationHandler } = makeUseCaseWithHandler();
    await useCase.execute(makeInput());

    expect(onNotificationHandler.execute).toHaveBeenCalledOnce();
    expect(onNotificationHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      action: 'RESCHEDULE',
    });
  });

  it('reschedule succeeds if onNotificationHandler throws', async () => {
    const { useCase, onNotificationHandler } = makeUseCaseWithHandler();
    onNotificationHandler.execute.mockRejectedValueOnce(new Error('Notification failure'));

    const result = await useCase.execute(makeInput());

    expect(result.tenantConfirmationStatus).toBe('PENDING');
  });

  it('does not call onNotificationHandler when not provided', async () => {
    const { useCaseWithout, onNotificationHandler } = makeUseCaseWithHandler();
    await useCaseWithout.execute(makeInput());

    expect(onNotificationHandler.execute).not.toHaveBeenCalled();
  });
});
