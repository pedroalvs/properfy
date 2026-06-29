import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/get-appointment.use-case';
import { ListAppointmentsUseCase } from '../../../src/modules/appointment/application/use-cases/list-appointments.use-case';
import type { IAppointmentRepository, AppointmentWithRelations, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
import type { AuthContext } from '@properfy/shared';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';

function makeAppointmentEntity(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'DRAFT',
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
): AppointmentWithRelations {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: makeContact(),
    contacts: [makeContact()],
    restrictions: [],
    propertyCode: 'PROP-001',
    propertyAddress: '123 Test St',
    propertySuburb: 'TestSuburb',
    propertyLatitude: -33.8,
    propertyLongitude: 151.2,
    branchName: 'Test Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: null,
  };
}

function makeListItem(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentListItem {
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact: makeContact(),
    propertyCode: 'PROP-001',
    propertyAddress: '123 Test St',
    propertyLatitude: -33.8,
    propertyLongitude: 151.2,
    rentalTenantName: 'Test Tenant',
    tenantAppointmentCodePrefix: 'INS',
    branchName: 'Test Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: null,
    serviceGroupNumber: null,
  };
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('GetAppointmentUseCase – rentalTenantNote in response', () => {
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let useCase: GetAppointmentUseCase;

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
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new GetAppointmentUseCase(appointmentRepo, new AuthorizationService(auditService));
  });

  it('should include rentalTenantNote in the response when it has a value', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ rentalTenantNote: 'Please call before arriving' }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor(),
    });

    expect(result.rentalTenantNote).toBe('Please call before arriving');
  });

  it('should include rentalTenantNote as null when not set', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ rentalTenantNote: null }),
    );

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      actor: makeActor(),
    });

    expect(result.rentalTenantNote).toBeNull();
  });
});

describe('ListAppointmentsUseCase – hasRentalTenantNote in response', () => {
  let appointmentRepo: IAppointmentRepository;
  let auditService: AuditService;
  let useCase: ListAppointmentsUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new ListAppointmentsUseCase(appointmentRepo, new AuthorizationService(auditService));
  });

  it('should return hasRentalTenantNote=true when rental_tenant_note has content', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeListItem({ rentalTenantNote: 'Dog is friendly but barks' }),
    ]);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'desc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hasRentalTenantNote).toBe(true);
  });

  it('should return hasRentalTenantNote=false when rental_tenant_note is null', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeListItem({ rentalTenantNote: null }),
    ]);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'desc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hasRentalTenantNote).toBe(false);
  });

  it('should return hasRentalTenantNote=false when rental_tenant_note is empty string', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([
      makeListItem({ rentalTenantNote: '' }),
    ]);

    const result = await useCase.execute({
      filters: {},
      pagination: { page: 1, pageSize: 10, sortOrder: 'desc' },
      actor: makeActor(),
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hasRentalTenantNote).toBe(false);
  });
});
