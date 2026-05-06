import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/tenant-portal/application/use-cases/confirm-appointment.use-case';
import {
  ReportUnavailabilityUseCase,
  type ReportUnavailabilityInput,
} from '../../../src/modules/tenant-portal/application/use-cases/report-unavailability.use-case';
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
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { ServiceTypeEntity } from '../../../src/modules/service-type/domain/service-type.entity';

// --- Factories ---

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: 'inspector-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    tenantNote: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
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
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
) {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: makeContact(),
    contacts: [makeContact()],
    restrictions: [],
  };
}

function makeServiceType(overrides: Partial<ConstructorParameters<typeof ServiceTypeEntity>[0]> = {}) {
  return new ServiceTypeEntity({
    id: 'svc-type-1',
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

// Reusable date constants for reschedule tests
const SCHEDULED_DATE = new Date(Date.now() - 14 * 24 * 3600 * 1000);
SCHEDULED_DATE.setHours(0, 0, 0, 0);

const FUTURE_DATE = new Date(Date.now() + 14 * 24 * 3600 * 1000)
  .toISOString()
  .split('T')[0]!;

// --- Confirm tests ---

describe('ConfirmAppointmentUseCase – tenantNote', () => {
  let activityRepo: ITenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: PersistentAuditService;
  let useCase: ConfirmAppointmentUseCase;

  beforeEach(() => {
    activityRepo = {
      save: vi.fn(),
      findLatestByTokenAndAction: vi.fn(),
    };
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeAppointmentWithRelations()),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as PersistentAuditService;
    useCase = new ConfirmAppointmentUseCase(activityRepo, appointmentRepo, auditService);
  });

  it('should persist tenantNote when provided on confirm', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      tenantNote: 'Please ring doorbell twice',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'CONFIRMED',
      tenantNote: 'Please ring doorbell twice',
    });
  });

  it('should not include tenantNote in update when not provided on confirm', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.tenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'CONFIRMED',
    });
  });
});

// --- Report Unavailability tests ---

describe('ReportUnavailabilityUseCase – tenantNote', () => {
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
      findById: vi.fn().mockResolvedValue(makeAppointmentWithRelations()),
      update: vi.fn().mockResolvedValue(undefined),
      deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
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
      activityRepo as unknown as ITenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService as unknown as PersistentAuditService,
      notificationHandler,
      executionRepo as never,
    );
  });

  it('should persist tenantNote when provided on report unavailability', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      tenantNote: 'I will be on holiday until next month',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    expect(result.tenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'UNAVAILABLE',
      tenantNote: 'I will be on holiday until next month',
    });
  });

  it('should not include tenantNote in update when not provided on report unavailability', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    expect(result.tenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantConfirmationStatus: 'UNAVAILABLE',
    });
  });
});

// --- Reschedule tests ---

describe('RescheduleRequestUseCase – tenantNote', () => {
  let activityRepo: {
    save: ReturnType<typeof vi.fn>;
    findLatestByTokenAndAction: ReturnType<typeof vi.fn>;
  };
  let tokenRepo: {
    findByTokenHash: ReturnType<typeof vi.fn>;
    findActiveByAppointmentId: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    revokeAndSave: ReturnType<typeof vi.fn>;
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
      revokeAndSave: vi.fn().mockResolvedValue(undefined),
      updateStatus: vi.fn(),
      updateLastAccessedAt: vi.fn(),
      revokeAllForAppointment: vi.fn().mockResolvedValue(undefined),
      expireActiveTokens: vi.fn(),
      markUsed: vi.fn().mockResolvedValue(undefined),
    };
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue(
        makeAppointmentWithRelations({ scheduledDate: SCHEDULED_DATE }),
      ),
      update: vi.fn().mockResolvedValue(undefined),
      deleteRestrictionsByAppointmentId: vi.fn().mockResolvedValue(undefined),
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
    reopenForRescheduleUseCase = {
      execute: vi.fn().mockResolvedValue({
        id: 'appt-1',
        previousStatus: 'SCHEDULED',
        status: 'DRAFT',
      }),
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

  it('should persist tenantNote when provided on reschedule', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      newDate: FUTURE_DATE,
      newTimeSlot: 'AFTERNOON',
      tenantNote: 'New date works better for me',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    expect(result.tenantConfirmationStatus).toBe('PENDING');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      tenantNote: 'New date works better for me',
    });
  });

  it('should not call appointmentRepo.update for tenantNote when not provided on reschedule', async () => {
    await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      newDate: FUTURE_DATE,
      newTimeSlot: 'AFTERNOON',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    // appointmentRepo.update should not be called directly — reschedule delegates to ReopenForRescheduleUseCase
    expect(appointmentRepo.update).not.toHaveBeenCalled();
  });
});

// --- Entity tests ---

describe('AppointmentEntity – tenantNote', () => {
  it('should set tenantNote from props', () => {
    const entity = makeAppointmentEntity({ tenantNote: 'Some tenant note' });
    expect(entity.tenantNote).toBe('Some tenant note');
  });

  it('should default tenantNote to null when not provided', () => {
    const entity = new AppointmentEntity({
      id: 'appt-2',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date(),
      timeSlot: '09:00-10:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      tenantConfirmationStatus: 'PENDING',
      priceAmount: 100,
      payoutAmount: 50,
      pricingRuleSnapshotJson: {},
      notes: null,
      customFieldsJson: null,
      reason: null,
      cancellationReasonCode: null,
      rejectionReasonCode: null,
      createdByUserId: 'user-1',
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });
    expect(entity.tenantNote).toBeNull();
  });

  it('should set tenantNote to null when explicitly passed null', () => {
    const entity = makeAppointmentEntity({ tenantNote: null });
    expect(entity.tenantNote).toBeNull();
  });
});
