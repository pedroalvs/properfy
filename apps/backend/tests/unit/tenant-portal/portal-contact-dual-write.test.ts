import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateContactUseCase } from '../../../src/modules/tenant-portal/application/use-cases/update-contact.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { ContactEmailAlreadyExistsError } from '../../../src/modules/contact/domain/contact.errors';

function makeAppointment(overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-05-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'CONFIRMED',
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

function makeContact(overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {}) {
  return new AppointmentContactEntity({
    id: 'junction-1',
    appointmentId: 'appt-1',
    contactId: 'registry-contact-1',
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'John Smith',
    snapshotEmail: 'john@example.com',
    snapshotPhone: '+61400000000',
    tenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeLegacyContact() {
  return makeContact({ contactId: null });
}

describe('Portal contact dual-write (FR-053)', () => {
  let appointmentRepo: any;
  let activityRepo: any;
  let auditService: any;
  let contactRepo: any;
  let useCase: UpdateContactUseCase;

  beforeEach(() => {
    const contact = makeContact();
    activityRepo = { save: vi.fn() };
    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact,
        contacts: [contact],
        restrictions: [],
      }),
      updateContact: vi.fn(),
      updateContactSnapshot: vi.fn(),
      deleteContactsByAppointmentId: vi.fn(),
    };
    auditService = { log: vi.fn() };
    contactRepo = {
      existsByEmail: vi.fn().mockResolvedValue(false),
      existsByPhone: vi.fn().mockResolvedValue(false),
      update: vi.fn(),
    };
    useCase = new UpdateContactUseCase(activityRepo, appointmentRepo, auditService, undefined, contactRepo);
  });

  const baseInput = {
    tokenId: 'token-1',
    appointmentId: 'appt-1',
    isReadOnly: false,
    contact: { primaryEmail: 'newemail@example.com' },
    ipAddress: '192.168.1.1',
    userAgent: 'TestAgent',
  };

  it('should update appointment snapshot fields', async () => {
    await useCase.execute(baseInput);

    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalledWith(
      'appt-1',
      'junction-1',
      expect.objectContaining({ snapshotEmail: 'newemail@example.com' }),
    );
  });

  it('should update contact registry when contact_id is present', async () => {
    await useCase.execute(baseInput);

    expect(contactRepo.update).toHaveBeenCalledWith(
      'registry-contact-1',
      'tenant-1',
      expect.objectContaining({ primaryEmail: 'newemail@example.com' }),
    );
  });

  it('should skip registry update on email conflict and emit audit', async () => {
    contactRepo.existsByEmail.mockResolvedValue(true);

    await useCase.execute(baseInput);

    // Snapshot still updated
    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalled();
    // Registry NOT updated
    expect(contactRepo.update).not.toHaveBeenCalled();
    // Conflict audit emitted
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'contact.portal_update_skipped_conflict',
        entityId: 'registry-contact-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should only update snapshot (not registry) for legacy rows with contact_id = NULL', async () => {
    const legacyContact = makeLegacyContact();
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: legacyContact,
      contacts: [legacyContact],
      restrictions: [],
    });

    await useCase.execute(baseInput);

    // Snapshot updated
    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalled();
    // Registry NOT touched (no contact_id)
    expect(contactRepo.update).not.toHaveBeenCalled();
    expect(contactRepo.existsByEmail).not.toHaveBeenCalled();
  });

  it('should return effective fields in the response', async () => {
    const result = await useCase.execute(baseInput);

    // The input provided primaryEmail, so it should be returned directly
    expect(result.primaryEmail).toBe('newemail@example.com');
    // tenantName was not in the input — should use effectiveName from contact
    expect(result.tenantName).toBe('John Smith');
  });

  it('should preserve token (token is appointment-scoped, not junction-scoped)', async () => {
    // This test validates the design: updating contact fields does NOT
    // revoke tokens or modify the appointment_id FK on the token.
    // The use case does not call any token revocation method.
    await useCase.execute(baseInput);

    // No token-related calls should exist
    expect(appointmentRepo.deleteContactsByAppointmentId).not.toHaveBeenCalled();
  });
});
