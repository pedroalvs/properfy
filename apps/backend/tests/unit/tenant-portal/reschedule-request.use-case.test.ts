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
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { ReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
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
    doneMarkedByUserId: null,
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

function makeTenant(overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {}) {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    ...overrides,
  });
}

// Use a date 14 days in the future so the fixture never drifts into the past
// once real-world time crosses the hard-coded value (bug pattern we hit on
// 2026-04-20 — every literal `newDate: '2026-04-XX'` that became "today" or
// earlier started tripping `PortalDateInPastError`).
const FUTURE_DATE = new Date(Date.now() + 14 * 24 * 3600 * 1000)
  .toISOString()
  .split('T')[0]!;

function makeInput(overrides: Partial<RescheduleRequestInput> = {}): RescheduleRequestInput {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    isUsed: false,
    newDate: FUTURE_DATE,
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
    markUsed: ReturnType<typeof vi.fn>;
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
  let tenantRepo: {
    findById: ReturnType<typeof vi.fn>;
    findByLegalName: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let auditService: { log: ReturnType<typeof vi.fn> };
  let executionRepo: { findByAppointmentId: ReturnType<typeof vi.fn> };
  let reopenForRescheduleUseCase: { execute: ReturnType<typeof vi.fn> };
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
      markUsed: vi.fn().mockResolvedValue(undefined),
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
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() };
    executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    // Echo the input date back so window-boundary tests that pass a custom
    // `newDate` don't have to maintain a parallel fixture.
    reopenForRescheduleUseCase = {
      execute: vi.fn().mockImplementation(async (input: { newScheduledDate: string; newTimeSlot: string }) => ({
        id: 'appt-1',
        previousStatus: 'SCHEDULED',
        status: 'DRAFT',
        previousScheduledDate: '2026-04-15',
        scheduledDate: input.newScheduledDate,
        previousTimeSlot: 'MORNING',
        timeSlot: input.newTimeSlot,
        previousInspectorId: 'inspector-1',
        inspectorId: null,
        tenantConfirmationStatus: 'PENDING',
      })),
    };

    useCase = new RescheduleRequestUseCase(
      activityRepo as unknown as ITenantPortalActivityRepository,
      tokenRepo as unknown as ITenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      serviceTypeRepo as unknown as IServiceTypeRepository,
      executionRepo as unknown as IInspectionExecutionRepository,
      tenantRepo as unknown as ITenantRepository,
      auditService as unknown as PersistentAuditService,
      reopenForRescheduleUseCase as unknown as ReopenForRescheduleUseCase,
    );
  });

  it('should reschedule successfully by delegating to ReopenForRescheduleUseCase', async () => {
    const result = await useCase.execute(makeInput());

    expect(result).toEqual({
      scheduledDate: FUTURE_DATE,
      timeSlot: 'AFTERNOON',
      tenantConfirmationStatus: 'PENDING',
    });

    // Should call reopenForRescheduleUseCase instead of appointmentRepo.update
    expect(reopenForRescheduleUseCase.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      newScheduledDate: FUTURE_DATE,
      newTimeSlot: 'AFTERNOON',
      reason: 'Tenant portal reschedule request',
      actor: {
        userId: 'SYSTEM',
        tenantId: 'tenant-1',
        role: 'SYS',
        branchId: null,
        inspectorId: null,
      },
    });
    expect(appointmentRepo.update).not.toHaveBeenCalled();
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
      scheduledDate: FUTURE_DATE,
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

  it('should call audit service with ANONYMOUS actor type for portal-level audit', async () => {
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
      resumedAt: null,
      startLatitude: -33.8,
      startLongitude: 151.2,
      finishLatitude: null,
      finishLongitude: null,
      geolocationDistanceMeters: null,
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
      resumedAt: null,
      startLatitude: -33.8,
      startLongitude: 151.2,
      finishLatitude: -33.8,
      finishLongitude: 151.2,
      geolocationDistanceMeters: null,
      checklistJson: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(finishedExecution);

    const result = await useCase.execute(makeInput());
    expect(result.tenantConfirmationStatus).toBe('PENDING');
  });

  it('should not call appointmentRepo.update directly — all updates go through ReopenForRescheduleUseCase', async () => {
    await useCase.execute(makeInput());

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(reopenForRescheduleUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('should use default 30-day window when tenant has no portalRescheduleWindowDays setting', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({ settingsJson: {} }));

    // 30 days from scheduled date (2026-04-15) is within window
    const result = await useCase.execute(makeInput({ newDate: '2026-05-14' }));
    expect(result.scheduledDate).toBe('2026-05-14');
  });

  it('should reject dates beyond custom reschedule window from tenant settings', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({
      settingsJson: { portalRescheduleWindowDays: 14 },
    }));

    // 20 days from scheduled date (2026-04-15) exceeds 14-day window
    await expect(
      useCase.execute(makeInput({ newDate: '2026-05-05' })),
    ).rejects.toThrow(PortalRescheduleWindowExceededError);
  });

  it('should allow dates within custom reschedule window from tenant settings', async () => {
    tenantRepo.findById.mockResolvedValue(makeTenant({
      settingsJson: { portalRescheduleWindowDays: 14 },
    }));

    // 5 days ahead of today is always both inside the 14-day window and
    // never in the past (was previously a literal '2026-04-20', which
    // drifted into the past once real-world time crossed that date).
    const inWindow = new Date(Date.now() + 5 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0]!;
    const result = await useCase.execute(makeInput({ newDate: inWindow }));
    expect(result.scheduledDate).toBe(inWindow);
  });

  it('should use 30-day default when tenant not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    // 30 days is within default window
    const result = await useCase.execute(makeInput({ newDate: '2026-05-14' }));
    expect(result.scheduledDate).toBe('2026-05-14');
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
      markUsed: vi.fn().mockResolvedValue(undefined),
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
    const tenantRepoLocal = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
      findByLegalName: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    const reopenForRescheduleUseCase = {
      execute: vi.fn().mockResolvedValue({
        id: 'appt-1',
        previousStatus: 'SCHEDULED',
        status: 'DRAFT',
        previousScheduledDate: '2026-04-15',
        scheduledDate: '2026-04-20',
        previousTimeSlot: 'MORNING',
        timeSlot: 'AFTERNOON',
        previousInspectorId: 'inspector-1',
        inspectorId: null,
        tenantConfirmationStatus: 'PENDING',
      }),
    };
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
        tenantRepoLocal as unknown as ITenantRepository,
        auditService as unknown as PersistentAuditService,
        reopenForRescheduleUseCase as unknown as ReopenForRescheduleUseCase,
        onNotificationHandler,
      ),
      useCaseWithout: new RescheduleRequestUseCase(
        activityRepo as unknown as ITenantPortalActivityRepository,
        tokenRepo as unknown as ITenantPortalTokenRepository,
        appointmentRepo as unknown as IAppointmentRepository,
        serviceTypeRepo as unknown as IServiceTypeRepository,
        executionRepo as unknown as IInspectionExecutionRepository,
        tenantRepoLocal as unknown as ITenantRepository,
        auditService as unknown as PersistentAuditService,
        reopenForRescheduleUseCase as unknown as ReopenForRescheduleUseCase,
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
