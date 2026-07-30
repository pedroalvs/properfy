import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { PropertyEntity } from '../../../src/modules/property/domain/property.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BranchEntity } from '../../../src/modules/tenant/domain/branch.entity';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'st-1',
    inspectorId: 'insp-1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-04-01'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'CONFIRMED',
    priceAmount: 200,
    payoutAmount: 140,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
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

function makeProperty(): PropertyEntity {
  return new PropertyEntity({
    id: 'prop-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyCode: 'PROP-001',
    type: 'HOUSE',
    street: '123 Main St',
    addressLine2: 'Unit 4',
    suburb: 'Sydney',
    postcode: '2000',
    state: 'NSW',
    country: 'Australia',
    geocodingStatus: 'DONE',
    latitude: null,
    longitude: null,
    notes: null,
    rulesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
  replaceRestrictions: vi.fn(),
};

const propertyRepo = {
  findById: vi.fn(),
  findByPropertyCode: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const tenantRepo = {
  findById: vi.fn(),
};

function makeBranch(contactEmail: string | null = 'bookings@agency.example'): BranchEntity {
  return new BranchEntity({
    id: 'branch-1',
    tenantId: 'tenant-1',
    name: 'Sydney CBD Branch',
    addressJson: null,
    contactEmail,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

const branchRepo = {
  findById: vi.fn(),
  findByName: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  countByTenantIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const notificationRepo = {
  existsByAppointmentAndTemplate: vi.fn().mockResolvedValue(false),
  findLatestByAppointmentAndTemplates: vi.fn().mockResolvedValue(null),
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

/**
 * Previously announced notification, as the occurrence dedupe sees it: only the
 * template code and the announced date/slot matter.
 */
function makeSentNotification(
  templateCode: string,
  payloadJson: Record<string, string>,
): NotificationEntity {
  return new NotificationEntity({
    id: 'notif-prev',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    recipient: 'john@example.com',
    channel: templateCode.endsWith('_SMS') ? 'SMS' : 'EMAIL',
    templateCode,
    status: 'SENT',
    notificationClass: 'OPERATIONAL',
    providerName: null,
    providerMessageId: null,
    sentAt: new Date('2026-03-01'),
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson,
    retryCount: 0,
    nextRetryAt: null,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
  });
}

const mintPortalTokenService = {
  mint: vi.fn().mockResolvedValue({ rawToken: 'test-portal-token', expiresAt: new Date('2026-05-01') }),
};

const createNotification = {
  execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
};

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn().mockReturnThis(),
  silent: vi.fn(),
  level: 'info',
};

const metricsCollector = {
  incrementNotificationHandlerErrorCount: vi.fn(),
};

const buildNotificationPayload = new BuildNotificationPayloadService();
const appointmentCodeFormatter = new AppointmentCodeFormatter();

function makeHandler() {
  return new NotifyOnStatusTransitionHandler(
    appointmentRepo as any,
    propertyRepo as any,
    tenantRepo as any,
    branchRepo as any,
    notificationRepo as any,
    mintPortalTokenService as any,
    buildNotificationPayload,
    appointmentCodeFormatter,
    createNotification as any,
    'http://localhost:5173',
    logger as any,
    metricsCollector as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  appointmentRepo.findById.mockResolvedValue({
    appointment: makeAppointment(),
    contact: makeContact(),
    restrictions: [],
  });
  propertyRepo.findById.mockResolvedValue(makeProperty());
  tenantRepo.findById.mockResolvedValue(makeTenant());
  branchRepo.findById.mockResolvedValue(makeBranch());
  notificationRepo.existsByAppointmentAndTemplate.mockResolvedValue(false);
  notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(null);
  mintPortalTokenService.mint.mockResolvedValue({ rawToken: 'test-portal-token', expiresAt: new Date('2026-05-01') });
  createNotification.execute.mockResolvedValue({ notificationId: 'notif-1' });
});

describe('NotifyOnStatusTransitionHandler', () => {
  it('sends INSPECTION_NOTICE email when target is SCHEDULED', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_NOTICE',
        channel: 'EMAIL',
        recipient: 'john@example.com',
      }),
    );
  });

  it('tells only the agency on CANCELLED when notifyRentalTenant is not passed', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_CANCELLED_AGENCY',
        channel: 'EMAIL',
        recipient: 'bookings@agency.example',
      }),
    );
  });

  it('sends INSPECTION_CANCELLED to the tenant when opted in and the tenant confirmed', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    // Agency + tenant email + tenant SMS
    expect(createNotification.execute).toHaveBeenCalledTimes(3);
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_AGENCY' }),
    );
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED', channel: 'EMAIL' }),
    );
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_SMS', channel: 'SMS' }),
    );
  });

  it.each(['PENDING', 'UNAVAILABLE', 'NO_RESPONSE'] as const)(
    'refuses to notify the tenant when confirmation status is %s, even with the opt-in',
    async (status) => {
      appointmentRepo.findById.mockResolvedValue({
        appointment: makeAppointment({ rentalTenantConfirmationStatus: status }),
        contact: makeContact(),
        restrictions: [],
      });

      const handler = makeHandler();
      await handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'SCHEDULED',
        targetStatus: 'CANCELLED',
        notifyRentalTenant: true,
      });

      // The UI hides the checkbox in this case, but the rule is enforced here:
      // the API can be called directly.
      expect(createNotification.execute).toHaveBeenCalledOnce();
      expect(createNotification.execute).toHaveBeenCalledWith(
        expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_AGENCY' }),
      );
    },
  );

  it('still tells the agency when the appointment has no contact at all', async () => {
    // Import creates appointments with no contact on purpose (CONTACT_INCOMPLETE is
    // a warning, not an error — see appointment-import-commit.worker.ts). Those are
    // precisely the ones nobody accepts and the overdue sweep cancels, so skipping
    // the agency here would lose the notice in this feature's own core scenario.
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_CANCELLED_AGENCY',
        recipient: 'bookings@agency.example',
        // rentalTenantName is optional on this template, so an absent contact
        // renders it empty rather than throwing MissingRequiredVariableError.
        payloadJson: expect.objectContaining({ rentalTenantName: '' }),
      }),
    );
  });

  it('sends nothing to the tenant when there is no contact, even when opted in', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED' }),
    );
  });

  it('keeps the SCHEDULED path silent when there is no contact', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
    // The cheap replay path must stay cheap: nothing loaded before the bail-out.
    expect(tenantRepo.findById).not.toHaveBeenCalled();
  });

  it('does not let a branch lookup failure kill the tenant announcement', async () => {
    // Guards against hoisting the branch fetch out of the agency leg's try/catch.
    branchRepo.findById.mockRejectedValue(new Error('branch lookup exploded'));

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED', channel: 'EMAIL' }),
    );
  });

  it('logs when an explicit opt-in is discarded because the tenant never confirmed', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ rentalTenantConfirmationStatus: 'PENDING' }),
      contact: makeContact(),
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    // A caller asking for something we refuse must leave a trace; every other
    // skip in this handler logs, and a direct API integrator otherwise gets a
    // 200 and debugs a missing email.
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: 'appt-1' }),
      expect.stringContaining('opt-in'),
    );
  });

  it('skips the agency notice when the branch has no contact email', async () => {
    branchRepo.findById.mockResolvedValue(makeBranch(null));

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('still notifies the tenant when the branch is missing entirely', async () => {
    branchRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(createNotification.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_AGENCY' }),
    );
  });

  it('carries branchName and the cancellation reason in the agency payload', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment({ reason: 'Client requested a different week' }),
      contact: makeContact(),
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_CANCELLED_AGENCY',
        payloadJson: expect.objectContaining({
          branchName: 'Sydney CBD Branch',
          cancellationReason: 'Client requested a different week',
        }),
      }),
    );
  });

  it('does not let an agency-leg failure swallow the tenant announcement', async () => {
    // Both legs share one handler.execute(), and the caller's catch is a bare
    // swallow — an unguarded agency throw would silently lose the tenant email.
    createNotification.execute.mockRejectedValueOnce(new Error('agency leg exploded'));

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED', channel: 'EMAIL' }),
    );
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_SMS', channel: 'SMS' }),
    );
    // Contained, but not invisible.
    expect(metricsCollector.incrementNotificationHandlerErrorCount).toHaveBeenCalled();
  });

  it('does not notify the agency on SCHEDULED', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_AGENCY' }),
    );
  });

  it('skips notification when no contact exists (contact is null)', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('sends INSPECTION_NOTICE on both channels when the contact has an email and a phone', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_NOTICE', channel: 'EMAIL' }),
    );
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS' }),
    );
  });

  it('mints the portal token once and shares it across both legs', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    // A second mint would revoke the link the first message already carried.
    expect(mintPortalTokenService.mint).toHaveBeenCalledOnce();
  });

  it('sends only SMS when the contact has no email', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null }),
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'SMS',
        templateCode: 'INSPECTION_NOTICE_SMS',
        recipient: '+61400000000',
      }),
    );
  });

  it('skips notification when no email and no phone', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null, snapshotPhone: null }),
      restrictions: [],
    });

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips notification when appointment not found', async () => {
    appointmentRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips notification when tenant not found', async () => {
    tenantRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('does not send notification for irrelevant transitions', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'DRAFT',
      targetStatus: 'AWAITING_INSPECTOR',
    });

    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('logs error and increments metric when handler throws', async () => {
    createNotification.execute.mockRejectedValueOnce(new Error('Queue failure'));

    const handler = makeHandler();
    await expect(
      handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      }),
    ).rejects.toThrow('Queue failure');

    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        handler: 'NotifyOnStatusTransitionHandler',
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      }),
      'Notification handler failed',
    );
    expect(metricsCollector.incrementNotificationHandlerErrorCount).toHaveBeenCalledOnce();
  });

  it('does not log error or increment metric on success', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(logger.error).not.toHaveBeenCalled();
    expect(metricsCollector.incrementNotificationHandlerErrorCount).not.toHaveBeenCalled();
  });

  it('passes payloadJson with rentalTenantName and scheduledDate', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        appointmentId: 'appt-1',
        payloadJson: expect.objectContaining({
          rentalTenantName: 'John Smith',
          scheduledDate: '01/04/2026',
        }),
      }),
    );
  });

  it('uses property fullAddress when property is found', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.objectContaining({
          propertyAddress: '123 Main St, Unit 4, Sydney, NSW, 2000, Australia',
        }),
      }),
    );
  });

  it('falls back to empty string for address when property is not found', async () => {
    propertyRepo.findById.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadJson: expect.objectContaining({
          propertyAddress: '',
        }),
      }),
    );
  });

  it('continues sending notification when mint portal token fails', async () => {
    mintPortalTokenService.mint.mockRejectedValueOnce(new Error('Mint failed'));

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

/**
 * The dedupe is scoped to the occurrence, not to the appointment's lifetime: a
 * rental tenant must hear about every real (re-)entry into SCHEDULED/CANCELLED,
 * while a replay of the same announcement stays suppressed.
 */
describe('NotifyOnStatusTransitionHandler occurrence dedupe', () => {
  const NOTICE_PAYLOAD = { scheduledDate: '2026-04-01', timeSlot: '09:00-12:00' };

  it('sends when the appointment has never been announced', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(null);

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(notificationRepo.findLatestByAppointmentAndTemplates).toHaveBeenCalledWith(
      'appt-1',
      'tenant-1',
      expect.arrayContaining([
        'INSPECTION_NOTICE',
        'INSPECTION_NOTICE_SMS',
        'INSPECTION_CANCELLED',
        'INSPECTION_CANCELLED_SMS',
      ]),
    );
  });

  it('re-sends INSPECTION_NOTICE after a cancellation, even for the same date', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_CANCELLED', { scheduledDate: '2026-04-01' }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_NOTICE' }),
    );
  });

  it('skips when the last announcement was the same notice with the same date and slot', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', NOTICE_PAYLOAD),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  // Dual-channel writes the SMS leg last, so the SMS row — not the email one —
  // is what findLatest returns. Its payload is filtered to the template spec, so
  // if that spec omits a key the dedupe compares on, the comparison is silently
  // skipped and a genuine change is suppressed. Mocking the EMAIL variant here
  // (as the sibling tests do) would hide exactly that.
  it('re-sends when only the time slot changed and the latest row is the SMS leg', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      // Built through the real service so the payload carries exactly the keys
      // INSPECTION_NOTICE_SMS declares — no hand-written key list that could
      // drift from the spec and paper over the gap being tested.
      makeSentNotification(
        'INSPECTION_NOTICE_SMS',
        buildNotificationPayload.build({
          templateCode: 'INSPECTION_NOTICE_SMS',
          tenant: makeTenant(),
          // Same date, EARLIER slot than the current appointment (09:00-12:00):
          // only the time slot moved, which must still re-announce.
          appointment: makeAppointment({ timeSlotStart: '08:00', timeSlotEnd: '10:00' }),
          contact: makeContact(),
          propertyAddress: '123 Main St, Sydney',
          serviceTypeName: null,
          rawPortalToken: null,
          portalBaseUrl: 'http://localhost:5173',
          appointmentCodeFormatter,
        }),
      ),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('re-sends INSPECTION_NOTICE when the scheduled date changed', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', {
        ...NOTICE_PAYLOAD,
        scheduledDate: '2026-03-15',
      }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('re-sends INSPECTION_NOTICE when the time slot changed', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', {
        ...NOTICE_PAYLOAD,
        timeSlot: '13:00-16:00',
      }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  /**
   * Payloads stored before the dd/mm/yyyy + 12h rollout hold ISO values
   * ('2026-04-01', '09:00-12:00'). Without a compatibility arm every one of them
   * compares unequal to the freshly-formatted value, the handler concludes the
   * content changed, and every rental tenant with a pre-rollout appointment gets
   * a duplicate email/SMS on its next status transition.
   */
  describe('legacy ISO payload compatibility', () => {
    it('skips a repeat whose stored payload is in the pre-rollout ISO format', async () => {
      notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
        makeSentNotification('INSPECTION_NOTICE', {
          scheduledDate: '2026-04-01',
          timeSlot: '09:00-12:00',
        }),
      );

      const handler = makeHandler();
      await handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      });

      expect(createNotification.execute).not.toHaveBeenCalled();
    });

    it('skips a repeat whose stored payload is already in the new display format', async () => {
      notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
        makeSentNotification('INSPECTION_NOTICE', {
          scheduledDate: '01/04/2026',
          timeSlot: '9:00 am – 12:00 pm',
        }),
      );

      const handler = makeHandler();
      await handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      });

      expect(createNotification.execute).not.toHaveBeenCalled();
    });

    it('still re-sends when a legacy ISO payload carries a genuinely different date', async () => {
      // The compatibility arm must not blanket-suppress: a real change still notifies.
      notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
        makeSentNotification('INSPECTION_NOTICE', {
          scheduledDate: '2026-03-15',
          timeSlot: '09:00-12:00',
        }),
      );

      const handler = makeHandler();
      await handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      });

      expect(createNotification.execute).toHaveBeenCalledTimes(2);
    });

    it('still re-sends when a legacy ISO payload carries a genuinely different slot', async () => {
      notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
        makeSentNotification('INSPECTION_NOTICE', {
          scheduledDate: '2026-04-01',
          timeSlot: '13:00-16:00',
        }),
      );

      const handler = makeHandler();
      await handler.execute({
        appointmentId: 'appt-1',
        previousStatus: 'AWAITING_INSPECTOR',
        targetStatus: 'SCHEDULED',
      });

      expect(createNotification.execute).toHaveBeenCalledTimes(2);
    });
  });

  it('treats the SMS variant as the same announcement family', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE_SMS', { scheduledDate: '2026-04-01' }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('sends INSPECTION_CANCELLED when the last announcement was the notice', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', NOTICE_PAYLOAD),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    // Agency notice + both tenant legs: a notice followed by a cancellation is a
    // genuine state change, not a replay.
    expect(createNotification.execute).toHaveBeenCalledTimes(3);
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED' }),
    );
  });

  it('skips a repeated cancellation whose stored payload carries no timeSlot', async () => {
    // INSPECTION_CANCELLED declares no timeSlot variable, so an absent key must
    // not be read as "the slot changed" and force a re-send.
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_CANCELLED', { scheduledDate: '2026-04-01' }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).not.toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED' }),
    );
  });

  it('sends the agency notice even when the tenant announcement is deduped', async () => {
    // The tenant dedupe is a single decision about the TENANT's announcement. The
    // agency has its own recipient and its own template, so folding it into that
    // early return would make the two sends suppress each other.
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_CANCELLED', { scheduledDate: '2026-04-01' }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_CANCELLED_AGENCY' }),
    );
  });

  it('never puts the agency code in the tenant dedupe template set', async () => {
    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'SCHEDULED',
      targetStatus: 'CANCELLED',
      notifyRentalTenant: true,
    });

    const [, , templateCodes] =
      notificationRepo.findLatestByAppointmentAndTemplates.mock.calls[0];
    expect(templateCodes).not.toContain('INSPECTION_CANCELLED_AGENCY');
  });

  it('adds no repository calls to a deduped SCHEDULED replay', async () => {
    // notify-on-group-accepted re-invokes this handler for every member of a
    // group, so work done before the dedupe multiplies across the whole group.
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', NOTICE_PAYLOAD),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(tenantRepo.findById).not.toHaveBeenCalled();
    expect(propertyRepo.findById).not.toHaveBeenCalled();
    expect(branchRepo.findById).not.toHaveBeenCalled();
  });

  it('does not mint a portal token when the send is skipped', async () => {
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_NOTICE', NOTICE_PAYLOAD),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('applies the same single decision to the SMS fallback path', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null }),
      restrictions: [],
    });
    notificationRepo.findLatestByAppointmentAndTemplates.mockResolvedValue(
      makeSentNotification('INSPECTION_CANCELLED', { scheduledDate: '2026-04-01' }),
    );

    const handler = makeHandler();
    await handler.execute({
      appointmentId: 'appt-1',
      previousStatus: 'AWAITING_INSPECTOR',
      targetStatus: 'SCHEDULED',
    });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS' }),
    );
    // The lifetime guard belongs to reminders/escalations, not to this handler.
    expect(notificationRepo.existsByAppointmentAndTemplate).not.toHaveBeenCalled();
    expect(notificationRepo.findLatestByAppointmentAndTemplates).toHaveBeenCalledOnce();
  });
});
