import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateContactUseCase } from '../../../src/modules/rental-tenant-portal/application/use-cases/update-contact.use-case';
import type { IRentalTenantPortalActivityRepository } from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal-activity.repository';
import type { IAppointmentRepository, AppointmentWithRelations } from '../../../src/modules/appointment/domain/appointment.repository';
import type { PersistentAuditService } from '../../../src/modules/audit/application/services/persistent-audit.service';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalNoContactFieldsError,
} from '../../../src/modules/rental-tenant-portal/domain/rental-tenant-portal.errors';

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
    status: 'AWAITING_INSPECTOR',
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
    customFieldsJson: null,
    reason: null,
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

function makeContact(
  overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {},
): AppointmentContactEntity {
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
    rentalTenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: 'john2@example.com',
    primaryPhone: '+61400000000',
    secondaryPhone: '+61400000001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeAppointmentWithRelations(
  appointmentOverrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
  contactOverrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {},
): AppointmentWithRelations {
  const contact = makeContact(contactOverrides);
  return {
    appointment: makeAppointmentEntity(appointmentOverrides),
    contact,
    contacts: [contact],
    restrictions: [],
  };
}

function makeInput(overrides: Partial<Parameters<UpdateContactUseCase['execute']>[0]> = {}) {
  return {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    contact: {
      primaryEmail: 'newemail@example.com',
      primaryPhone: '+61400111111',
    },
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    ...overrides,
  };
}

describe('UpdateContactUseCase', () => {
  let activityRepo: IRentalTenantPortalActivityRepository;
  let appointmentRepo: IAppointmentRepository;
  let auditService: PersistentAuditService;
  let useCase: UpdateContactUseCase;

  beforeEach(() => {
    activityRepo = {
      save: vi.fn(),
      findLatestByTokenAndAction: vi.fn(),
    };
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      updateContactSnapshot: vi.fn(),
      deleteContactsByAppointmentId: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
    };
    auditService = {
      log: vi.fn(),
    } as unknown as PersistentAuditService;
    useCase = new UpdateContactUseCase(activityRepo, appointmentRepo, auditService);
  });

  it('should update only provided contact fields', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute(
      makeInput({
        contact: {
          primaryEmail: 'newemail@example.com',
          primaryPhone: '+61400111111',
        },
      }),
    );

    expect(appointmentRepo.updateContact).toHaveBeenCalledWith('appt-1', {
      primaryEmail: 'newemail@example.com',
      primaryPhone: '+61400111111',
    });
    expect(result.primaryEmail).toBe('newemail@example.com');
    expect(result.primaryPhone).toBe('+61400111111');
    // Non-updated fields should retain existing values
    expect(result.rentalTenantName).toBe('John Smith');
    expect(result.secondaryEmail).toBe('john2@example.com');
    expect(result.secondaryPhone).toBe('+61400000001');
  });

  it('should block contact updates when token is read-only (expired)', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await expect(useCase.execute(makeInput({ isReadOnly: true }))).rejects.toThrow(PortalActionBlockedError);
    expect(appointmentRepo.updateContact).not.toHaveBeenCalled();
  });

  it('should record CONTACT_UPDATED activity with previous and new values', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(
      makeInput({
        contact: { primaryEmail: 'newemail@example.com' },
      }),
    );

    expect(activityRepo.save).toHaveBeenCalledOnce();
    const savedActivity = vi.mocked(activityRepo.save).mock.calls[0][0];
    expect(savedActivity.action).toBe('CONTACT_UPDATED');
    expect(savedActivity.appointmentId).toBe('appt-1');
    expect(savedActivity.rentalTenantPortalTokenId).toBe('token-1');
    expect(savedActivity.previousValuesJson).toEqual({ primaryEmail: 'john@example.com' });
    expect(savedActivity.newValuesJson).toEqual({ primaryEmail: 'newemail@example.com' });
    expect(savedActivity.ipAddress).toBe('192.168.1.1');
    expect(savedActivity.userAgent).toBe('Mozilla/5.0');
  });

  it('should handle partial update with only primaryEmail', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute(
      makeInput({
        contact: { primaryEmail: 'only-email@example.com' },
      }),
    );

    expect(appointmentRepo.updateContact).toHaveBeenCalledWith('appt-1', {
      primaryEmail: 'only-email@example.com',
    });
    expect(result.primaryEmail).toBe('only-email@example.com');
    expect(result.primaryPhone).toBe('+61400000000');
  });

  it('should throw PortalNoContactFieldsError when no fields provided', async () => {
    await expect(
      useCase.execute(makeInput({ contact: {} })),
    ).rejects.toThrow(PortalNoContactFieldsError);

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
  });

  it('should throw PortalAppointmentInactiveError when appointment not found', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(null);

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
  });

  it('should block contact updates for terminal appointments', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DONE' }),
    );

    await expect(useCase.execute(makeInput())).rejects.toThrow(PortalAppointmentInactiveError);
    expect(appointmentRepo.updateContact).not.toHaveBeenCalled();
  });

  it('should log audit entry on contact update', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(
      makeInput({ contact: { primaryEmail: 'newemail@example.com' } }),
    );

    expect(auditService.log).toHaveBeenCalledWith({
      action: 'rental_tenant_portal.contact_updated',
      actorType: 'ANONYMOUS',
      entityType: 'appointment_contact',
      entityId: 'appt-1',
      tenantId: 'tenant-1',
      before: { primaryEmail: 'john@example.com' },
      after: { primaryEmail: 'newemail@example.com' },
      ipAddress: '192.168.1.1',
    });
  });

  it('should allow setting a field to null', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    const result = await useCase.execute(
      makeInput({ contact: { secondaryEmail: null } }),
    );

    expect(appointmentRepo.updateContact).toHaveBeenCalledWith('appt-1', {
      secondaryEmail: null,
    });
    expect(result.secondaryEmail).toBeNull();
  });

  it('should pass null tenantId to findById', async () => {
    vi.mocked(appointmentRepo.findById).mockResolvedValue(makeAppointmentWithRelations());

    await useCase.execute(makeInput());

    expect(appointmentRepo.findById).toHaveBeenCalledWith('appt-1', null);
  });
});
