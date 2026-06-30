import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ReportUnavailabilityUseCase,
  type ReportUnavailabilityInput,
} from '../../../src/modules/rental-tenant-portal/application/use-cases/report-unavailability.use-case';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import {
  PortalAppointmentInactiveError,
  PortalInspectionAlreadyStartedError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';

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
    rentalTenantConfirmationStatus: 'PENDING',
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

function makeInput(overrides: Partial<ReportUnavailabilityInput> = {}): ReportUnavailabilityInput {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    isUsed: false,
    ipAddress: '127.0.0.1',
    userAgent: 'TestAgent/1.0',
    ...overrides,
  };
}

describe('ReportUnavailabilityUseCase', () => {
  let activityRepo: {
    save: ReturnType<typeof vi.fn>;
    findLatestByTokenAndAction: ReturnType<typeof vi.fn>;
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
  let auditService: { log: ReturnType<typeof vi.fn> };
  let notificationHandler: { execute: ReturnType<typeof vi.fn> };
  let executionRepo: { findByAppointmentId: ReturnType<typeof vi.fn> };
  let useCase: ReportUnavailabilityUseCase;

  beforeEach(() => {
    activityRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
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
    auditService = { log: vi.fn() };
    notificationHandler = { execute: vi.fn().mockResolvedValue(undefined) };
    executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };

    useCase = new ReportUnavailabilityUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService as unknown as PersistentAuditService,
      notificationHandler,
      executionRepo as never,
    );
  });

  it('should set rentalTenantConfirmationStatus to UNAVAILABLE when within window', async () => {
    const result = await useCase.execute(makeInput());

    expect(result).toEqual({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      urgentMode: false,
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
  });

  it('allows urgent unavailable reports after cutoff while the inspection has not started', async () => {
    await expect(useCase.execute(makeInput({ isReadOnly: true }))).resolves.toEqual({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      urgentMode: true,
    });

    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
  });

  it('should return idempotent success if already UNAVAILABLE without recording new activity', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ rentalTenantConfirmationStatus: 'UNAVAILABLE' }),
      contact: null,
      restrictions: [],
    });

    const result = await useCase.execute(makeInput());

    expect(result).toEqual({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      urgentMode: false,
    });

    // Should NOT update appointment or record activity
    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('should throw PortalAppointmentInactiveError for CANCELLED appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'CANCELLED', rentalTenantConfirmationStatus: 'PENDING' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for DONE appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'DONE', rentalTenantConfirmationStatus: 'PENDING' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should throw PortalAppointmentInactiveError for REJECTED appointment', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ status: 'REJECTED', rentalTenantConfirmationStatus: 'PENDING' }),
      contact: null,
      restrictions: [],
    });

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should record UNAVAILABLE_REPORTED activity with previous values', async () => {
    await useCase.execute(makeInput());

    expect(activityRepo.save).toHaveBeenCalledTimes(1);
    const savedActivity = activityRepo.save.mock.calls[0][0];
    expect(savedActivity.action).toBe('UNAVAILABLE_REPORTED');
    expect(savedActivity.previousValuesJson).toEqual({
      rentalTenantConfirmationStatus: 'PENDING',
    });
    expect(savedActivity.newValuesJson).toEqual({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
    expect(savedActivity.ipAddress).toBe('127.0.0.1');
    expect(savedActivity.userAgent).toBe('TestAgent/1.0');
  });

  it('should trigger operational notification in the normal path', async () => {
    await useCase.execute(makeInput());

    expect(notificationHandler.execute).toHaveBeenCalledWith({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      action: 'UNAVAILABLE',
    });
  });

  it('should swallow notification failures', async () => {
    notificationHandler.execute.mockRejectedValueOnce(new Error('Queue failure'));

    await expect(useCase.execute(makeInput())).resolves.toEqual({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      urgentMode: false,
    });
  });

  it('should save restrictions when provided', async () => {
    const restrictions = {
      isHome: false,
      unavailableDaysJson: ['2026-04-16'],
      unavailableHoursJson: null,
      notes: 'Away on holiday',
    };

    await useCase.execute(makeInput({ restrictions }));

    expect(appointmentRepo.deleteRestrictionsByAppointmentId).toHaveBeenCalledWith('appt-1');
    expect(appointmentRepo.saveRestriction).toHaveBeenCalledTimes(1);
    const savedRestriction = appointmentRepo.saveRestriction.mock.calls[0][0];
    expect(savedRestriction.isHome).toBe(false);
    expect(savedRestriction.notes).toBe('Away on holiday');
    expect(savedRestriction.source).toBe('RENTAL_TENANT_PORTAL');
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
        action: 'rental_tenant_portal.unavailability_reported',
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

  it('rejects when the inspection has already started in field', async () => {
    executionRepo.findByAppointmentId.mockResolvedValue(
      new InspectionExecutionEntity({
        id: 'exec-1',
        appointmentId: 'appt-1',
        inspectorId: 'insp-1',
        startedAt: new Date('2026-04-15T09:00:00Z'),
        finishedAt: null,
        resumedAt: null,
        startLatitude: -1,
        startLongitude: -1,
        finishLatitude: null,
        finishLongitude: null,
        geolocationDistanceMeters: null,
        checklistJson: null,
        notes: null,
        createdAt: new Date('2026-04-15T09:00:00Z'),
        updatedAt: new Date('2026-04-15T09:00:00Z'),
      }),
    );

    await expect(useCase.execute(makeInput({ isReadOnly: true }))).rejects.toThrow(
      PortalInspectionAlreadyStartedError,
    );
  });

  it('should include availableSlotsJson in newValuesJson when restrictions contain slots (T021)', async () => {
    const slots = [
      { dayOfWeek: 'MON' as const, start: '09:00', end: '12:00' },
      { dayOfWeek: 'WED' as const, start: '14:00', end: '17:00' },
    ];
    await useCase.execute(
      makeInput({
        restrictions: {
          isHome: false,
          unavailableDaysJson: null,
          unavailableHoursJson: null,
          availableSlotsJson: slots,
          notes: null,
        },
      }),
    );

    const savedActivity = appointmentRepo.saveRestriction.mock.calls[0]?.[0];
    expect(savedActivity?.availableSlotsJson).toEqual(slots);

    const activityCall = activityRepo.save.mock.calls[0]?.[0];
    expect(activityCall?.newValuesJson).toMatchObject({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      availableSlotsJson: slots,
    });
  });

  it('should NOT include availableSlotsJson in newValuesJson when absent (T021)', async () => {
    await useCase.execute(
      makeInput({
        restrictions: {
          isHome: false,
          unavailableDaysJson: null,
          unavailableHoursJson: null,
          notes: null,
        },
      }),
    );

    const activityCall = activityRepo.save.mock.calls[0]?.[0];
    expect(activityCall?.newValuesJson).not.toHaveProperty('availableSlotsJson');
  });
});
