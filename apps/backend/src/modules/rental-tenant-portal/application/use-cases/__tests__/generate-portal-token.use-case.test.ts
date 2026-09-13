import { describe, it, expect, vi } from 'vitest';
import { portalTokenResponseSchema, PLATFORM_TIMEZONE, todayInTzDateString, addCivilDays } from '@properfy/shared';
import { GeneratePortalTokenUseCase } from '../generate-portal-token.use-case';
import { PortalAppointmentDatePastError } from '../../../domain/rental-tenant-portal.errors';
import { AppointmentEntity } from '../../../../appointment/domain/appointment.entity';
import { AppointmentContactEntity } from '../../../../appointment/domain/appointment-contact.entity';

/** UTC-midnight Date for a Sydney civil date offset by `deltaDays` from today. */
function civilDatePlus(deltaDays: number): Date {
  const civil = addCivilDays(todayInTzDateString(PLATFORM_TIMEZONE), deltaDays);
  return new Date(`${civil}T00:00:00.000Z`);
}

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

// Default to a week ahead so the WI-B8 past-date guard never trips the
// happy-path fixtures; the past-date tests below override this explicitly.
const FUTURE_SCHEDULED_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function makeAppointment(scheduledDate: Date = FUTURE_SCHEDULED_DATE): AppointmentEntity {
  return new AppointmentEntity({
    id: 'appt-1',
    appointmentNumber: 1,
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate,
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 100,
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
    role: 'RENTAL_TENANT',
    isPrimary: true,
    snapshotName: 'Test Tenant',
    snapshotEmail: withEmail ? 'tenant@example.com' : null,
    snapshotPhone: withPhone ? '+61400000000' : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeUseCase(options: {
  logger?: ReturnType<typeof makeLogger>;
  createNotificationUseCase?: { execute: ReturnType<typeof vi.fn> };
  contact?: AppointmentContactEntity | null;
  scheduledDate?: Date;
}) {
  const logger = options.logger ?? makeLogger();
  const contact = options.contact !== undefined ? options.contact : makeContact();
  const appointment = options.scheduledDate ? makeAppointment(options.scheduledDate) : makeAppointment();

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
    // settingsJson matches the real TenantEntity shape (never undefined) — the
    // payload is now built by BuildNotificationPayloadService, which reads it.
    findById: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test Agency', settingsJson: {} }),
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

  return { uc, logger, auditService, mintPortalTokenService };
}

describe('GeneratePortalTokenUseCase — logger behavior on notification dispatch failure', () => {
  describe('EMAIL channel failure', () => {
    it('should log rental_tenant_portal.notification_dispatch_failed with error context', async () => {
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
        'rental_tenant_portal.notification_dispatch_failed',
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
    it('should log rental_tenant_portal.notification_dispatch_failed for SMS failure', async () => {
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
        'rental_tenant_portal.notification_dispatch_failed',
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
      expect(auditCalls).toContain('rental_tenant_portal.token_generated');
      // dispatch_failed must NOT appear as an audit action (it is a logger.error, not an audit log)
      expect(auditCalls).not.toContain('rental_tenant_portal.notification_dispatch_failed');
    });
  });
});

describe('GeneratePortalTokenUseCase — generate-only (notify: false)', () => {
  it('should mint the token but skip dispatch entirely and return NOTIFY_DISABLED', async () => {
    const createNotificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    };
    const { uc } = makeUseCase({ createNotificationUseCase });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR, notify: false });

    expect(result.token).toBe('raw-token-abc');
    expect(result.dispatched).toBe(false);
    expect((result as { reason?: string }).reason).toBe('NOTIFY_DISABLED');
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
  });

  it('should audit the skipped dispatch with reason NOTIFY_DISABLED', async () => {
    const { uc, auditService } = makeUseCase({});

    await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR, notify: false });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'rental_tenant_portal.dispatch_skipped',
        metadata: expect.objectContaining({ reason: 'NOTIFY_DISABLED' }),
      }),
    );
  });

  it('should still dispatch when notify is omitted (default true)', async () => {
    const createNotificationUseCase = {
      execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }),
    };
    const { uc } = makeUseCase({ createNotificationUseCase });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.dispatched).toBe(true);
    expect(createNotificationUseCase.execute).toHaveBeenCalled();
  });

  it('should return NOTIFY_DISABLED even without a primary contact (generate-only ignores contacts)', async () => {
    const { uc } = makeUseCase({ contact: null });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR, notify: false });

    expect(result.dispatched).toBe(false);
    expect((result as { reason?: string }).reason).toBe('NOTIFY_DISABLED');
  });
});

describe('GeneratePortalTokenUseCase — WI-B3: truthful dispatched + no recipient PII (#510, #480)', () => {
  it('returns dispatched:false with NO_DISPATCH_CHANNEL when no notification use case is wired', async () => {
    // createNotificationUseCase omitted → nothing is ever attempted. The old
    // `attempted > 0 && succeeded === 0` guard was skipped, so it lied dispatched:true.
    const { uc } = makeUseCase({});

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.dispatched).toBe(false);
    expect((result as { reason?: string }).reason).toBe('NO_DISPATCH_CHANNEL');
  });

  it('returns dispatched:false with NO_DISPATCH_CHANNEL when the primary contact has no email or phone', async () => {
    const createNotificationUseCase = { execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }) };
    const { uc } = makeUseCase({
      createNotificationUseCase,
      contact: makeContact({ withEmail: false, withPhone: false }),
    });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.dispatched).toBe(false);
    expect((result as { reason?: string }).reason).toBe('NO_DISPATCH_CHANNEL');
    expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    // The route serializes this via portalTokenResponseSchema; the wire enum must
    // accept NO_DISPATCH_CHANNEL or the 201 becomes a post-commit 500.
    expect(() => portalTokenResponseSchema.parse(result)).not.toThrow();
  });

  it('does not log the recipient (PII) when a dispatch fails', async () => {
    const logger = makeLogger();
    const createNotificationUseCase = { execute: vi.fn().mockRejectedValue(new Error('enqueue failed')) };
    const { uc } = makeUseCase({ logger, createNotificationUseCase });

    await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    const logArg = logger.error.mock.calls[0]![0] as Record<string, unknown>;
    expect(logArg).not.toHaveProperty('recipient');
    expect(logArg).toMatchObject({ channel: 'EMAIL', appointmentId: 'appt-1', tenantId: 'tenant-1' });
  });
});

describe('GeneratePortalTokenUseCase — WI-B8: block dispatch for past-dated appointments (#33)', () => {
  it('rejects the dispatch path when the scheduled date is in the past, minting no token', async () => {
    const createNotificationUseCase = { execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }) };
    const { uc, mintPortalTokenService } = makeUseCase({
      createNotificationUseCase,
      scheduledDate: civilDatePlus(-1), // yesterday (Sydney civil)
    });

    await expect(
      uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR }),
    ).rejects.toBeInstanceOf(PortalAppointmentDatePastError);
    // A born-expired token must never be minted.
    expect(mintPortalTokenService.mint).not.toHaveBeenCalled();
  });

  it('allows the dispatch path when the scheduled date is today', async () => {
    const createNotificationUseCase = { execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }) };
    const { uc } = makeUseCase({
      createNotificationUseCase,
      scheduledDate: civilDatePlus(0), // today (Sydney civil) — token stays valid to end of day
    });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.dispatched).toBe(true);
  });

  it('does NOT block the Copy Link path (notify:false) for a past date — the operator asked for the link', async () => {
    const { uc, mintPortalTokenService } = makeUseCase({ scheduledDate: civilDatePlus(-1) });

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR, notify: false });

    expect(result.dispatched).toBe(false);
    expect((result as { reason?: string }).reason).toBe('NOTIFY_DISABLED');
    expect(mintPortalTokenService.mint).toHaveBeenCalled();
  });
});

describe('GeneratePortalTokenUseCase — cycle P2002 replay (WI-B2 / #1056)', () => {
  // The confirmation cycle's @@unique([appointment_id, cycle_number]) can lose a
  // concurrent-insert race. createInitial rethrows that P2002 to its transaction
  // owner (this use case), whose retryOnUniqueConflict must whitelist cycle_number
  // and replay the whole transaction — re-reading the now-committed cycle.
  it('retries the transaction when createInitial rejects with a cycle P2002 and then succeeds', async () => {
    const cycleP2002 = { code: 'P2002', meta: { target: ['appointment_id', 'cycle_number'] } };

    const contact = makeContact();
    const appointment = makeAppointment();

    const tokenRepo = { findActiveByAppointmentId: vi.fn(), save: vi.fn(), revokeAndSave: vi.fn() };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue({ appointment, contact, contacts: [contact], restrictions: [] }),
    };
    const tenantRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test Agency', settingsJson: {} }),
    };
    const mintPortalTokenService = {
      mint: vi.fn().mockResolvedValue({ rawToken: 'raw-token-abc', tokenId: 'token-1', expiresAt: new Date(Date.now() + 86400000) }),
    };
    const auditService = { log: vi.fn() };
    const createNotificationUseCase = { execute: vi.fn().mockResolvedValue({ notificationId: 'notif-1' }) };
    const cycleService = {
      createInitial: vi.fn().mockRejectedValueOnce(cycleP2002).mockResolvedValueOnce(undefined),
    };
    const prisma = {
      // Each attempt opens a fresh transaction; the callback runs against a stub tx.
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn({})),
    };

    const uc = new GeneratePortalTokenUseCase(
      tokenRepo as any,
      appointmentRepo as any,
      tenantRepo as any,
      mintPortalTokenService as any,
      auditService as any,
      'https://portal.example.test',
      createNotificationUseCase as any,
      cycleService as any,
      prisma as any,
      makeLogger() as any,
    );

    const result = await uc.execute({ appointmentId: 'appt-1', actor: OP_ACTOR });

    expect(result.token).toBe('raw-token-abc');
    // First attempt threw the cycle P2002; the second linked to the existing cycle.
    expect(cycleService.createInitial).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
