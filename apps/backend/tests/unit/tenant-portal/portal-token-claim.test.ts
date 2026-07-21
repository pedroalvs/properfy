import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/confirm-appointment.use-case';
import { RescheduleRequestUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/reschedule-request.use-case';
import { ReportUnavailabilityUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/report-unavailability.use-case';
import { JoinGroupUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/join-group.use-case';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceTypeRepository } from '../../../src/modules/service-type/domain/service-type.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import type { ReopenForRescheduleUseCase } from '../../../src/modules/appointment/application/use-cases/reopen-for-reschedule.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { ServiceGroupEntity } from '../../../src/modules/service-group/domain/service-group.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { PortalTokenAlreadyUsedError } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

// Freeze "now" so the mock scheduledDate stays in the future and the 30-day
// reschedule window guard never trips on CI date drift (same convention as
// gap-002-003-004.test.ts).
beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'stype-1',
    inspectorId: null,
    status: 'AWAITING_INSPECTOR',
    scheduledDate: new Date('2026-04-15'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
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

function makeTokenRepo() {
  return {
    findByTokenHash: vi.fn(),
    findActiveByAppointmentId: vi.fn(),
    save: vi.fn(),
    revokeAndSave: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn(),
    updateLastAccessedAt: vi.fn(),
    tryClaim: vi.fn().mockResolvedValue(true),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
    expireActiveTokens: vi.fn().mockResolvedValue(0),
  };
}

function makeActivityRepo() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findLatestByTokenAndAction: vi.fn().mockResolvedValue(null),
  };
}

function makeAppointmentRepo(appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return {
    findById: vi.fn().mockResolvedValue({
      appointment: makeAppointment(appointmentOverrides),
      contact: null,
      contacts: [],
      restrictions: [],
    }),
    update: vi.fn().mockResolvedValue(undefined),
    saveRestriction: vi.fn().mockResolvedValue(undefined),
    deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
  };
}

const auditService = () => ({ log: vi.fn() }) as unknown as PersistentAuditService;

// =========================================================================
// ConfirmAppointmentUseCase
// =========================================================================

describe('ConfirmAppointmentUseCase atomic token claim', () => {
  function build() {
    const activityRepo = makeActivityRepo();
    const appointmentRepo = makeAppointmentRepo();
    const tokenRepo = makeTokenRepo();
    const useCase = new ConfirmAppointmentUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isPastConfirmCutoff: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, tokenRepo, input };
  }

  it('claims the token atomically before any side effect', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(appointmentRepo.deleteRestrictionsByAppointmentId).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('does not claim the token on the idempotent already-CONFIRMED path', async () => {
    const { activityRepo, tokenRepo, input } = build();
    const appointmentRepo = makeAppointmentRepo({ rentalTenantConfirmationStatus: 'CONFIRMED' });
    const useCase = new ConfirmAppointmentUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');
  });
});

// =========================================================================
// ReportUnavailabilityUseCase
// =========================================================================

describe('ReportUnavailabilityUseCase atomic token claim', () => {
  function build() {
    const activityRepo = makeActivityRepo();
    const appointmentRepo = makeAppointmentRepo();
    const tokenRepo = makeTokenRepo();
    const useCase = new ReportUnavailabilityUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isPastConfirmCutoff: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, tokenRepo, input };
  }

  it('claims the token atomically before any side effect', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('does not claim the token on the idempotent already-UNAVAILABLE path', async () => {
    const { activityRepo, tokenRepo, input } = build();
    const appointmentRepo = makeAppointmentRepo({ rentalTenantConfirmationStatus: 'UNAVAILABLE' });
    const useCase = new ReportUnavailabilityUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService(),
      undefined,
      undefined,
      undefined,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
    );

    const result = await useCase.execute(input);

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(tokenRepo.tryClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, activityRepo, tokenRepo, input } = build();
    activityRepo.save.mockRejectedValue(new Error('activity write failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('activity write failed');
  });
});

// =========================================================================
// RescheduleRequestUseCase
// =========================================================================

describe('RescheduleRequestUseCase atomic token claim', () => {
  function makeServiceType() {
    return new ServiceTypeEntity({
      id: 'stype-1',
      code: 'ROUTINE',
      name: 'Routine Inspection',
      flowType: 'ROUTINE',
      requiresRentalTenantConfirmation: true,
      status: 'ACTIVE',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });
  }

  function makeTenant() {
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
    });
  }

  function build() {
    const activityRepo = makeActivityRepo();
    const tokenRepo = makeTokenRepo();
    const appointmentRepo = makeAppointmentRepo({ status: 'SCHEDULED', inspectorId: 'insp-1' });
    const serviceTypeRepo = { findById: vi.fn().mockResolvedValue(makeServiceType()) };
    const executionRepo = { findByAppointmentId: vi.fn().mockResolvedValue(null) };
    const tenantRepo = { findById: vi.fn().mockResolvedValue(makeTenant()) };
    const reopenForReschedule = {
      execute: vi.fn().mockResolvedValue({
        id: 'appt-1', previousStatus: 'SCHEDULED', status: 'DRAFT',
        scheduledDate: '2026-04-20', timeSlotStart: '14:00', timeSlotEnd: '17:00',
        rentalTenantConfirmationStatus: 'PENDING',
      }),
    };
    const useCase = new RescheduleRequestUseCase(
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      tokenRepo as unknown as IRentalTenantPortalTokenRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      serviceTypeRepo as unknown as IServiceTypeRepository,
      executionRepo as unknown as IInspectionExecutionRepository,
      tenantRepo as unknown as ITenantRepository,
      auditService(),
      reopenForReschedule as unknown as ReopenForRescheduleUseCase,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isUsed: false,
      newDate: '2026-04-17',
      newTimeSlotStart: '14:00', newTimeSlotEnd: '17:00',
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, tokenRepo, reopenForReschedule, input };
  }

  it('claims the token atomically before delegating to reopen-for-reschedule', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
    // Reschedule still revokes all active tokens to restart the confirmation cycle
    expect(tokenRepo.revokeAllForAppointment).toHaveBeenCalledWith('appt-1');
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, tokenRepo, reopenForReschedule, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(reopenForReschedule.execute).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.revokeAllForAppointment).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when reopen-for-reschedule fails', async () => {
    const { useCase, tokenRepo, reopenForReschedule, input } = build();
    reopenForReschedule.execute.mockRejectedValue(new Error('transition failed'));

    await expect(useCase.execute(input)).rejects.toThrow('transition failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, tokenRepo, reopenForReschedule, input } = build();
    reopenForReschedule.execute.mockRejectedValue(new Error('transition failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('transition failed');
  });
});

// =========================================================================
// JoinGroupUseCase
// =========================================================================

describe('JoinGroupUseCase atomic token claim', () => {
  function makeGroup() {
    return new ServiceGroupEntity({
      id: 'sg-new',
      tenantId: 'tenant-1',
      serviceTypeId: 'stype-1',
      status: 'ACCEPTED',
      groupSize: 10,
      offeredCount: 3,
      confirmedCount: 3,
      scheduledDate: new Date('2026-04-20'),
      timeWindow: '09:00-12:00',
      name: null,
      regionName: null,
      description: null,
      assignedInspectorId: 'insp-1',
      serviceRegionId: null,
      publishedAt: null,
      assignedAt: null,
      createdByUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function build() {
    const activityRepo = makeActivityRepo();
    const tokenRepo = makeTokenRepo();
    const appointmentRepo = makeAppointmentRepo({ propertyId: 'prop-1' });
    const serviceGroupRepo = {
      findById: vi.fn().mockResolvedValue({
        group: makeGroup(),
        assignedInspectorName: 'John Smith',
        tenantIds: ['tenant-1'],
        appointments: [],
      }),
      findPortalEligibleSlots: vi.fn().mockResolvedValue([
        {
          groupId: 'sg-new',
          scheduledDate: new Date('2026-04-20T00:00:00.000Z'),
          timeSlotStart: '13:00',
          timeSlotEnd: '15:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          confirmedCount: 3,
          capacityMax: 10,
        },
      ]),
      hasPortalMemberSlot: vi.fn().mockResolvedValue(true),
      decrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
      incrementConfirmedCount: vi.fn().mockResolvedValue(undefined),
    };
    const statusTransition = {
      execute: vi.fn().mockResolvedValue({
        id: 'appt-1',
        status: 'SCHEDULED',
        previousStatus: 'AWAITING_INSPECTOR',
        reason: null,
        inspectorId: 'insp-1',
        doneCheckedByUserId: null,
        doneCheckedAt: null,
        updatedAt: new Date(),
      }),
    };
    const useCase = new JoinGroupUseCase(
      appointmentRepo as any,
      serviceGroupRepo as any,
      activityRepo as any,
      tokenRepo as any,
      auditService(),
      statusTransition as any,
    );
    const input = {
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      groupId: 'sg-new',
      scheduledDate: '2026-04-20',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'Test/1.0',
    };
    return { useCase, activityRepo, appointmentRepo, serviceGroupRepo, statusTransition, tokenRepo, input };
  }

  it('claims the token atomically before any side effect', async () => {
    const { useCase, tokenRepo, input } = build();
    await useCase.execute(input);
    expect(tokenRepo.tryClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.tryClaim).toHaveBeenCalledWith('token-1', 'appt-1');
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('throws PortalTokenAlreadyUsedError and performs no side effect when the claim loses the race', async () => {
    const { useCase, activityRepo, appointmentRepo, serviceGroupRepo, statusTransition, tokenRepo, input } = build();
    tokenRepo.tryClaim.mockResolvedValue(false);

    await expect(useCase.execute(input)).rejects.toThrow(PortalTokenAlreadyUsedError);

    expect(appointmentRepo.update).not.toHaveBeenCalled();
    expect(serviceGroupRepo.decrementConfirmedCount).not.toHaveBeenCalled();
    expect(serviceGroupRepo.incrementConfirmedCount).not.toHaveBeenCalled();
    expect(statusTransition.execute).not.toHaveBeenCalled();
    expect(activityRepo.save).not.toHaveBeenCalled();
    expect(tokenRepo.releaseClaim).not.toHaveBeenCalled();
  });

  it('releases the claim and propagates the original error when a side effect fails', async () => {
    const { useCase, serviceGroupRepo, tokenRepo, input } = build();
    serviceGroupRepo.incrementConfirmedCount.mockRejectedValue(new Error('increment failed'));

    await expect(useCase.execute(input)).rejects.toThrow('increment failed');

    expect(tokenRepo.releaseClaim).toHaveBeenCalledTimes(1);
    expect(tokenRepo.releaseClaim).toHaveBeenCalledWith('token-1', 'appt-1');
  });

  it('propagates the original error even when releaseClaim itself fails', async () => {
    const { useCase, serviceGroupRepo, tokenRepo, input } = build();
    serviceGroupRepo.incrementConfirmedCount.mockRejectedValue(new Error('increment failed'));
    tokenRepo.releaseClaim.mockRejectedValue(new Error('release failed'));

    await expect(useCase.execute(input)).rejects.toThrow('increment failed');
  });
});
