import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateContactUseCase } from '../../../src/modules/tenant-portal/application/use-cases/update-contact.use-case';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';

/**
 * Tests the 021 snapshot immutability invariant in the portal context:
 * When a renter updates their contact via the portal for appointment A,
 * appointment B's snapshot (linked to the same registry contact) is NOT touched.
 * The portal only writes to A's junction row + the registry. B is structurally untouched.
 */

function makeAppointment(id: string) {
  return new AppointmentEntity({
    id,
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
  });
}

function makeContactForAppointment(appointmentId: string, junctionId: string) {
  return new AppointmentContactEntity({
    id: junctionId,
    appointmentId,
    contactId: 'shared-registry-contact',
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'Original Name',
    snapshotEmail: 'original@example.com',
    snapshotPhone: '+61400000000',
    tenantName: 'Original Name',
    primaryEmail: 'original@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('Portal contact snapshot immutability across appointments', () => {
  it('should update only appointment A snapshot, not appointment B', async () => {
    const contactA = makeContactForAppointment('appt-A', 'junction-A');
    const contactB = makeContactForAppointment('appt-B', 'junction-B');

    const activityRepo = { save: vi.fn() };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment('appt-A'),
        contact: contactA,
        contacts: [contactA],
        restrictions: [],
      }),
      updateContact: vi.fn(),
      updateContactSnapshot: vi.fn(),
      deleteContactsByAppointmentId: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const contactRepo = {
      existsByEmail: vi.fn().mockResolvedValue(false),
      update: vi.fn(),
    };

    const useCase = new UpdateContactUseCase(activityRepo, appointmentRepo, auditService, undefined, contactRepo);

    await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-A',
      isReadOnly: false,
      contact: { primaryEmail: 'updated@example.com' },
      ipAddress: '10.0.0.1',
      userAgent: 'Test',
    });

    // A's snapshot was updated
    expect(appointmentRepo.updateContactSnapshot).toHaveBeenCalledWith(
      'appt-A',
      'junction-A',
      expect.objectContaining({ snapshotEmail: 'updated@example.com' }),
    );

    // The call was only for appt-A, never for appt-B
    const calls = appointmentRepo.updateContactSnapshot.mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('appt-A');

    // Registry was updated (shared contact)
    expect(contactRepo.update).toHaveBeenCalledWith(
      'shared-registry-contact',
      'tenant-1',
      expect.objectContaining({ primaryEmail: 'updated@example.com' }),
    );

    // B's snapshot was never touched — the portal use case only operates on the
    // appointment identified by the token. B's junction row is structurally untouched.
    // (This is verified by the single call assertion above.)
  });

  it('should update registry so future appointments get the new data', async () => {
    const contactA = makeContactForAppointment('appt-A', 'junction-A');

    const activityRepo = { save: vi.fn() };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment('appt-A'),
        contact: contactA,
        contacts: [contactA],
        restrictions: [],
      }),
      updateContact: vi.fn(),
      updateContactSnapshot: vi.fn(),
      deleteContactsByAppointmentId: vi.fn(),
    };
    const auditService = { log: vi.fn() };
    const contactRepo = {
      existsByEmail: vi.fn().mockResolvedValue(false),
      update: vi.fn(),
    };

    const useCase = new UpdateContactUseCase(activityRepo, appointmentRepo, auditService, undefined, contactRepo);

    await useCase.execute({
      tokenId: 'token-1',
      appointmentId: 'appt-A',
      isReadOnly: false,
      contact: { primaryPhone: '+61499999999' },
      ipAddress: '10.0.0.1',
      userAgent: 'Test',
    });

    // Registry updated with new phone — future appointments that link to this
    // contact will snapshot the new phone at link time.
    expect(contactRepo.update).toHaveBeenCalledWith(
      'shared-registry-contact',
      'tenant-1',
      expect.objectContaining({ primaryPhone: '+61499999999' }),
    );
  });
});
