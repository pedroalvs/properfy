import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmAppointmentUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/confirm-appointment.use-case';
import {
  ReportUnavailabilityUseCase,
} from '../../../src/modules/rental-tenant-portal/application/use-cases/report-unavailability.use-case';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';

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
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    rentalTenantNote: null,
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
    rentalTenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    primaryPhone: '+61400000000',
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


// --- Confirm tests ---

describe('ConfirmAppointmentUseCase – rentalTenantNote', () => {
  let activityRepo: IRentalTenantPortalActivityRepository;
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

  it('should persist rentalTenantNote when provided on confirm', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      rentalTenantNote: 'Please ring doorbell twice',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'CONFIRMED',
      rentalTenantNote: 'Please ring doorbell twice',
    });
  });

  it('should not include rentalTenantNote in update when not provided on confirm', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(result.rentalTenantConfirmationStatus).toBe('CONFIRMED');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'CONFIRMED',
    });
  });
});

// --- Report Unavailability tests ---

describe('ReportUnavailabilityUseCase – rentalTenantNote', () => {
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
      activityRepo as unknown as IRentalTenantPortalActivityRepository,
      appointmentRepo as unknown as IAppointmentRepository,
      auditService as unknown as PersistentAuditService,
      notificationHandler,
      executionRepo as never,
    );
  });

  it('should persist rentalTenantNote when provided on report unavailability', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      rentalTenantNote: 'I will be on holiday until next month',
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      rentalTenantNote: 'I will be on holiday until next month',
    });
  });

  it('should not include rentalTenantNote in update when not provided on report unavailability', async () => {
    const result = await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-1',
      isReadOnly: false,
      isUsed: false,
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent/1.0',
    });

    expect(result.rentalTenantConfirmationStatus).toBe('UNAVAILABLE');
    expect(appointmentRepo.update).toHaveBeenCalledWith('appt-1', 'tenant-1', {
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
    });
  });
});

// --- Entity tests ---

describe('AppointmentEntity – rentalTenantNote', () => {
  it('should set rentalTenantNote from props', () => {
    const entity = makeAppointmentEntity({ rentalTenantNote: 'Some tenant note' });
    expect(entity.rentalTenantNote).toBe('Some tenant note');
  });

  it('should default rentalTenantNote to null when not provided', () => {
    const entity = new AppointmentEntity({
      id: 'appt-2',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'property-1',
      serviceTypeId: 'svc-type-1',
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date(),
      timeSlotStart: '09:00', timeSlotEnd: '10:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'PENDING',
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
    expect(entity.rentalTenantNote).toBeNull();
  });

  it('should set rentalTenantNote to null when explicitly passed null', () => {
    const entity = makeAppointmentEntity({ rentalTenantNote: null });
    expect(entity.rentalTenantNote).toBeNull();
  });
});
