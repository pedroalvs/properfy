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
    rentalTenantName: 'John Smith',
    primaryEmail: 'john@example.com',
    secondaryEmail: null,
    primaryPhone: '+61400000000',
    secondaryPhone: null,
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

    expect(createNotification.execute).toHaveBeenCalledTimes(2);
  });

  it('falls back to SMS when the contact has no email', async () => {
    appointmentRepo.findById.mockResolvedValue({
      appointment: makeAppointment(),
      contact: makeContact({ primaryEmail: null }),
      restrictions: [],
    });
    tenantRepo.findById.mockResolvedValue(makeTenant());

    await makeHandler().execute({ appointmentId: 'appt-1', tenantId: 'tenant-1' });

    expect(createNotification.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCode: 'INSPECTION_RESCHEDULED_SMS',
        channel: 'SMS',
        recipient: '+61400000000',
      }),
    );
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
