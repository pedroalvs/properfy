import { describe, it, expect, vi } from 'vitest';
import { GeneratePortalTokenUseCase } from '../generate-portal-token.use-case';
import { AppointmentEntity } from '../../../../appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../../appointment/domain/appointment-contact.entity';

/**
 * Unit tests for GeneratePortalTokenUseCase — logger behavior (T007)
 *
 * Verifies that:
 * - silent catch blocks are replaced with structured logger.error calls
 * - fire-and-forget semantics are preserved (endpoint still returns dispatched:true)
 * - the audit trail is NOT mutated on notification failure
 */

const OP_ACTOR = { userId: 'user-op', tenantId: 'tenant-1', branchId: null, role: 'OP' as const, inspectorId: null };

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
}

function makeAppointment(): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-06-01'),
    timeSlot: '09:00-10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    tenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
    payoutAmount: 80,
    pricingRuleSnapshotJson: {},
    notes: null,
    tenantNote: null,
    customFieldsJson: null,
    reason: null,
    cancellationReasonCode: null,
    rejectionReasonCode: null,
    createdByUserId: 'user-1',
    doneMarkedByUserId: null,
    doneCheckedByUserId: null,
    doneCheckedAt: null,
    serviceGroupId: null,
    activeConfirmationCycleId: 'cycle-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });
}

/** A primary contact with both email and phone, triggering both dispatch code paths */
function makeContact(opts: { withEmail?: boolean; withPhone?: boolean } = {}): AppointmentContactEntity {
  const { withEmail = true, withPhone = false } = opts;
  return new AppointmentContactEntity({
    id: 'contact-1',
    appointmentId: 'appt-1',
    contactId: null,
    role: 'TENANT',
    isPrimary: true,
    snapshotName: 'Test Tenant',
    snapshotEmail: withEmail ? 'tenant@example.com' : null,
    snapshotPhone: withPhone ? '+61400000000' : null,
    tenantName: 'Test Tenant',
    primaryEmail: null,
    secondaryEmail: null,
    primaryPhone: null,
    secondaryPhone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeUseCase(options: {
  logger?: ReturnType<typeof makeLogger>;
  createNotificationUseCase?: { execute: ReturnType<typeof vi.fn> };
  contact?: AppointmentContactEntity | null;
}) {
  const logger = options.logger ?? makeLogger();
  const contact = options.contact !== undefined ? options.contact : makeContact();
  const appointment = makeAppointment();

  const tokenRepo = {
    findActiveByAppointmentId: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    revokeAndSave: vi.fn().mockResolvedValue(undefined),
  };
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue({
      appointment,
      contact,
      contacts: contact ? [contact] : [],
      restrictions: [],
    }),
  };
  const tenantRepo = {
    findById: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test Agency' }),
  };
  const mintPortalTokenService = {
    mint: vi.fn().mockResolvedValue({ rawToken: 'raw-token-abc', tokenId: 'token-1', expiresAt: new Date(Date.now() + 86400000) }),
  };
  const auditService = { log: vi.fn() };

  const uc = new GeneratePortalTokenUseCase(
    tokenRepo as any,
    appointmentRepo as any,
    tenantRepo as any,
    mintPortalTokenService as any,
    auditService as any,
    'https://portal.example.test',
    options.createNotificationUseCase as any,
    undefined,
    undefined,
    logger as any,
  );

  return { uc, logger, auditService };
}

describe('GeneratePortalTokenUseCase — logger behavior on notification dispatch failure', () => {
  describe('EMAIL channel failure', () => {
    it('should log tenant_portal.notification_dispatch_failed with error context', async () => {
      const logger = makeLogger();
      const createNotificationUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('enqueue failed')),
      };
      const { uc } = makeUseCase({ logger, createNotificationUseCase });

      await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-1',
          tenantId: 'tenant-1',
          channel: 'EMAIL',
        }),
        'tenant_portal.notification_dispatch_failed',
      );
    });

    it('should still return the token but report dispatched:false when EMAIL notification throws', async () => {
      const createNotificationUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('enqueue failed')),
      };
      const { uc } = makeUseCase({ createNotificationUseCase });

      const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      // fire-and-forget keeps the endpoint a 201 (token persisted), but the
      // caller must know nothing went out — the UI used to claim "Email sent".
      expect(result.token).toBe('raw-token-abc');
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('DISPATCH_FAILED');
    });
  });

  describe('SMS channel failure', () => {
    it('should log tenant_portal.notification_dispatch_failed for SMS failure', async () => {
      const logger = makeLogger();
      const createNotificationUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('sms provider down')),
      };
      const { uc } = makeUseCase({
        logger,
        createNotificationUseCase,
        contact: makeContact({ withEmail: false, withPhone: true }),
      });

      await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-1',
          tenantId: 'tenant-1',
          channel: 'SMS',
        }),
        'tenant_portal.notification_dispatch_failed',
      );
    });

    it('should still return the token but report dispatched:false when SMS notification throws', async () => {
      const createNotificationUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('sms error')),
      };
      const { uc } = makeUseCase({
        createNotificationUseCase,
        contact: makeContact({ withEmail: false, withPhone: true }),
      });

      const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      expect(result.token).toBe('raw-token-abc');
      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('DISPATCH_FAILED');
    });
  });

  describe('success path — no error logs', () => {
    it('should not call logger.error when both channels succeed', async () => {
      const logger = makeLogger();
      const createNotificationUseCase = {
        execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
      };
      const { uc } = makeUseCase({ logger, createNotificationUseCase });

      await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe('audit trail integrity', () => {
    it('should not mutate the audit trail when notification dispatch fails', async () => {
      const createNotificationUseCase = {
        execute: vi.fn().mockRejectedValue(new Error('enqueue failed')),
      };
      const { uc, auditService } = makeUseCase({ createNotificationUseCase });

      await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

      // Only the standard audit actions should fire, not any extra entries for failures
      const auditCalls = (auditService.log as ReturnType<typeof vi.fn>).mock.calls.map((args: any[]) => (args[0] as any).action);
      expect(auditCalls).toContain('tenant_portal.token_generated');
      // dispatch_failed must NOT appear as an audit action (it is a logger.error, not an audit log)
      expect(auditCalls).not.toContain('tenant_portal.notification_dispatch_failed');
    });
  });
});
