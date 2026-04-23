import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';

/**
 * T047 — Notification recipient resolution from snapshot fields.
 *
 * Verifies that:
 *   1. Status-transition notification resolves recipient from snapshotEmail
 *      of the primary junction contact (not from legacy primaryEmail).
 *   2. When snapshotEmail is null and legacy primaryEmail is present,
 *      effectiveEmail falls back gracefully.
 *
 * Escalation dispatcher (snapshotPhone / snapshotName) is covered separately
 * in unit tests for DispatchEscalationsUseCase. This file focuses on the
 * status-transition handler which was the most critical path renamed in T040.
 */

function makeAppointment(id = 'appt-1') {
  return new AppointmentEntity({
    id,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-type-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-08-01'),
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

function makeContact(overrides: Partial<ConstructorParameters<typeof AppointmentContactEntity>[0]> = {}) {
  return new AppointmentContactEntity({
    id: 'junction-1',
    appointmentId: 'appt-1',
    contactId: 'registry-1',
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'Snapshot Name',
    snapshotEmail: 'snapshot@example.com',
    snapshotPhone: '+61400000001',
    tenantName: 'Legacy Name',
    primaryEmail: 'legacy@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe('Notification recipient resolution from snapshot fields (T047)', () => {
  let appointmentRepo: any;
  let propertyRepo: any;
  let createNotification: any;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn().mockResolvedValue({ fullAddress: '1 Test St, Sydney NSW 2000' }),
    };
    createNotification = { execute: vi.fn().mockResolvedValue(undefined) };
  });

  it('status-transition to SCHEDULED: resolves recipient from snapshotEmail (not legacy primaryEmail)', async () => {
    const contact = makeContact();
    // contact.effectiveEmail = snapshotEmail = 'snapshot@example.com'
    // (NOT legacy primaryEmail 'legacy@example.com')

    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact,
        contacts: [contact],
        restrictions: [],
      }),
    };

    const handler = new NotifyOnStatusTransitionHandler(
      appointmentRepo,
      propertyRepo,
      createNotification,
    );

    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'snapshot@example.com',
        templateCode: 'INSPECTION_NOTICE',
        payloadJson: expect.objectContaining({
          tenantName: 'Snapshot Name',
        }),
      }),
    );
  });

  it('status-transition to SCHEDULED: falls back to legacy primaryEmail when snapshotEmail is null', async () => {
    const contact = makeContact({
      snapshotEmail: null,
      snapshotName: null,
      // legacy fields present
      primaryEmail: 'legacy@example.com',
      tenantName: 'Legacy Name',
    });
    // contact.effectiveEmail = null ?? 'legacy@example.com' = 'legacy@example.com'

    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact,
        contacts: [contact],
        restrictions: [],
      }),
    };

    const handler = new NotifyOnStatusTransitionHandler(
      appointmentRepo,
      propertyRepo,
      createNotification,
    );

    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'legacy@example.com',
        payloadJson: expect.objectContaining({
          tenantName: 'Legacy Name',
        }),
      }),
    );
  });

  it('status-transition to CANCELLED: resolves recipient from snapshotEmail', async () => {
    const contact = makeContact();

    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact,
        contacts: [contact],
        restrictions: [],
      }),
    };

    const handler = new NotifyOnStatusTransitionHandler(
      appointmentRepo,
      propertyRepo,
      createNotification,
    );

    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: 'snapshot@example.com',
        templateCode: 'INSPECTION_CANCELLED',
      }),
    );
  });

  it('status-transition to DONE: no notification sent (no template for DONE)', async () => {
    const contact = makeContact();

    appointmentRepo = {
      findById: vi.fn().mockResolvedValue({
        appointment: makeAppointment(),
        contact,
        contacts: [contact],
        restrictions: [],
      }),
    };

    const handler = new NotifyOnStatusTransitionHandler(
      appointmentRepo,
      propertyRepo,
      createNotification,
    );

    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'DONE',
    });

    // DONE has no template → no notification created
    expect(createNotification.execute).not.toHaveBeenCalled();
  });
});
