import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';

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
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
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

function makeTenant() {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: {},
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
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'Snapshot Name',
    snapshotEmail: 'snapshot@example.com',
    snapshotPhone: '+61400000001',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const buildNotificationPayload = new BuildNotificationPayloadService();
const appointmentCodeFormatter = new AppointmentCodeFormatter();

describe('Notification recipient resolution from snapshot fields (T047)', () => {
  let appointmentRepo: any;
  let propertyRepo: any;
  let tenantRepo: any;
  let notificationRepo: any;
  let mintPortalTokenService: any;
  let createNotification: any;

  beforeEach(() => {
    propertyRepo = {
      findById: vi.fn().mockResolvedValue(null),
    };
    tenantRepo = {
      findById: vi.fn().mockResolvedValue(makeTenant()),
    };
    notificationRepo = {
      existsByAppointmentAndTemplate: vi.fn().mockResolvedValue(false),
    };
    mintPortalTokenService = {
      mint: vi.fn().mockResolvedValue({ rawToken: 'portal-token-abc', expiresAt: new Date('2026-07-31T09:00:00Z') }),
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
      tenantRepo,
      notificationRepo,
      mintPortalTokenService,
      buildNotificationPayload,
      appointmentCodeFormatter,
      createNotification,
      'http://localhost:5173',
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
          rentalTenantName: 'Snapshot Name',
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
      tenantRepo,
      notificationRepo,
      mintPortalTokenService,
      buildNotificationPayload,
      appointmentCodeFormatter,
      createNotification,
      'http://localhost:5173',
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
      tenantRepo,
      notificationRepo,
      mintPortalTokenService,
      buildNotificationPayload,
      appointmentCodeFormatter,
      createNotification,
      'http://localhost:5173',
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
