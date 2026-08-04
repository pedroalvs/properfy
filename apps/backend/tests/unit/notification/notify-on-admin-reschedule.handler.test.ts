import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotifyOnAdminRescheduleHandler } from '../../../src/modules/notification/application/handlers/notify-on-admin-reschedule.handler';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../src/modules/appointment/domain/appointment-contact.entity';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';

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
    scheduledDate: new Date('2026-08-01'),
    timeSlotStart: '09:00', timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
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

const appointmentRepo = { findById: vi.fn() };
const propertyRepo = { findById: vi.fn().mockResolvedValue(null) };
const tenantRepo = { findById: vi.fn() };
const mintPortalTokenService = {
  mint: vi.fn().mockResolvedValue({ rawToken: 'new-portal-token', expiresAt: new Date('2026-09-01') }),
};
const createNotification = { execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }) };
const logger = {
  error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(),
  trace: vi.fn(), fatal: vi.fn(), child: vi.fn().mockReturnThis(), silent: vi.fn(), level: 'info',
};
const metricsCollector = { incrementNotificationHandlerErrorCount: vi.fn() };

function makeHandler() {
  return new NotifyOnAdminRescheduleHandler(
    appointmentRepo as any,
    propertyRepo as any,
    tenantRepo as any,
    mintPortalTokenService as any,
    new BuildNotificationPayloadService(),
    new AppointmentCodeFormatter(),
    createNotification as any,
    'http://localhost:5173',
    logger as any,
    metricsCollector as any,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  propertyRepo.findById.mockResolvedValue(null);
  mintPortalTokenService.mint.mockResolvedValue({ rawToken: 'new-portal-token', expiresAt: new Date('2026-09-01') });
  createNotification.execute.mockResolvedValue({ notificationId: 'notif-1' });
});

describe('NotifyOnAdminRescheduleHandler', () => {
  it('sends INSPECTION_RESCHEDULED email and mints a fresh portal token', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(mintPortalTokenService.mint).toHaveBeenCalled();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_RESCHEDULED',
        channel: 'EMAIL',
        recipient: 'john@example.com',
      }),
    );
  });

  // Email-only: INSPECTION_RESCHEDULED_SMS was retired with the other three
  // occupant-action twins. The email carries the new date and a fresh portal link,
  // neither of which fits an SMS worth sending.
  it('notifies by email only, even when the contact has a phone', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).toHaveBeenCalledOnce();
    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_RESCHEDULED', channel: 'EMAIL' }),
    );
  });

  it('mints the portal token once per reschedule', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(mintPortalTokenService.mint).toHaveBeenCalledOnce();
  });

  it('does NOT dedupe by template — a second reschedule notifies again', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    const handler = makeHandler();
    await handler.execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });
    await handler.execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    // Two runs, one email leg each.
    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when the contact has a phone but no email', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null }),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  // `mint` calls revokeAndSave, so minting for a contact we cannot email would revoke
  // whatever link they still hold and give the replacement to nobody. The guard has to
  // sit ABOVE the mint, not merely above the send.
  it('does not mint a portal token for a contact it cannot email', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null }),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('still sends the email when portal token mint fails (links render empty)', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());
    mintPortalTokenService.mint.mockRejectedValue(new Error('mint failed'));

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({ templateCode: 'INSPECTION_RESCHEDULED' }),
    );
  });

  it('skips silently when the tenant is not found', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact(),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(null);

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips silently when the contact has neither email nor phone', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ snapshotEmail: null, snapshotPhone: null }),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('skips silently when the appointment has no contact', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      restrictions: [],
    });

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('logs, counts the metric and rethrows on downstream failure', async () => {
    appointmentRepo.findById.mockRejectedValue(new Error('db down'));

    await expect(
      makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' }),
    ).rejects.toThrow('db down');
    expect(logger.error).toHaveBeenCalled();
    expect(metricsCollector.incrementNotificationHandlerErrorCount).toHaveBeenCalled();
  });
});
