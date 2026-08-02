/**
 * End-to-end test of the mirror seam against a real database.
 *
 * Wires the REAL SendNotificationUseCase to the REAL CreateNotificationUseCase and the
 * REAL Prisma repositories — the same composition the container builds — so the whole
 * promise of the feature is exercised in one place: an occupant message is withheld, and
 * a mirror addressed to the branch contact is actually persisted.
 *
 * The unit tests mock `forwardNotification`, so they prove the gate calls the port but
 * not that the port's payload is a valid notification. That gap is exactly where a
 * shape mismatch would survive typechecking and fail in production.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { PrismaNotificationConsentRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-consent.repository';
import { PrismaNotificationAttemptRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-attempt.repository';
import { createAgencyForwardRecipientReader } from '../../../src/modules/notification/infrastructure/prisma-agency-forward-recipient.reader';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { SendNotificationUseCase } from '../../../src/modules/notification/application/use-cases/send-notification.use-case';
import { TemplateRendererService } from '../../../src/modules/notification/domain/template-renderer.service';
import type { Logger } from '../../../src/shared/infrastructure/logger';
import type { MetricsCollector } from '../../../src/shared/infrastructure/metrics';

let harness: DbHarness;
let tenantId: string;
let appointmentId: string;
let sut: ReturnType<typeof buildPipeline>;

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

const silentLogger = {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  fatal: vi.fn(), trace: vi.fn(), child: vi.fn(), level: 'silent', silent: vi.fn(),
} as unknown as Logger;

function buildPipeline(platformSettings: Record<string, unknown> = {}) {
  const notificationRepo = new PrismaNotificationRepository(harness.prisma);
  const templateRepo = new PrismaNotificationTemplateRepository(harness.prisma);
  const emailProvider = { send: vi.fn().mockResolvedValue({ messageId: 'msg-1' }) };
  const smsProvider = { send: vi.fn().mockResolvedValue({ messageId: 'sms-1' }), getStatus: vi.fn() };
  const metrics = {
    incrementMissingVariableCount: vi.fn(),
    incrementNotificationHandlerErrorCount: vi.fn(),
    incrementAgencyForwardFailedCount: vi.fn(),
  } as unknown as MetricsCollector;
  // The mirror is enqueued, not sent inline; the row is what this test asserts on.
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };

  const createNotification = new CreateNotificationUseCase(
    notificationRepo,
    templateRepo,
    jobQueue as never,
    silentLogger,
  );

  const getAgencyForwardRecipient = vi.fn(createAgencyForwardRecipientReader(harness.prisma));
  const sendNotification = new SendNotificationUseCase({
    notificationRepo,
    templateRepo,
    consentRepo: new PrismaNotificationConsentRepository(harness.prisma),
    attemptRepo: new PrismaNotificationAttemptRepository(harness.prisma),
    emailProvider: emailProvider as never,
    smsProvider: smsProvider as never,
    templateRenderer: new TemplateRendererService(),
    logger: silentLogger,
    metrics,
    getTenantSettings: async (id) => {
      if (id === null) return platformSettings;
      const t = await harness.prisma.tenant.findUnique({ where: { id }, select: { settings_json: true } });
      return (t?.settings_json as Record<string, unknown>) ?? {};
    },
    getAgencyForwardRecipient,
    // Exactly the container's wiring.
    forwardNotification: async (input) => {
      await createNotification.execute(input);
    },
  });

  return {
    notificationRepo,
    createNotification,
    sendNotification,
    emailProvider,
    smsProvider,
    metrics,
    getAgencyForwardRecipient,
  };
}

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, notification_templates, appointments, properties, service_types, users, branches, tenants CASCADE`,
  );

  const seeded = await seedTenant(harness.prisma, `E2E Agency ${rand()}`);
  tenantId = seeded.tenantId;
  await harness.prisma.tenant.update({
    where: { id: tenantId },
    data: { settings_json: { rentalTenantNotificationsEnabled: false } },
  });

  const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
  await harness.prisma.branch.update({
    where: { id: branch.id },
    data: { name: 'Sydney CBD', contact_email: 'branch@agency.example' },
  });

  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`, name: `Routine ${rand()}`, flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true, status: 'ACTIVE',
    },
  });
  const property = await harness.prisma.property.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_code: `P-${rand()}`,
      type: 'HOUSE', street: '123 Flower St', suburb: 'Sydney', postcode: '2000', state: 'NSW',
    },
  });
  const appointment = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_id: property.id,
      service_type_id: serviceType.id, status: 'AWAITING_INSPECTOR',
      scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING', created_by_user_id: seeded.userId,
    },
  });
  appointmentId = appointment.id;

  // Platform templates: the occupant one being withheld, and the mirror.
  await harness.prisma.notificationTemplate.createMany({
    data: [
      {
        tenant_id: null, template_code: 'INSPECTION_NOTICE', channel: 'EMAIL',
        subject: 'Inspection at {{propertyAddress}}', body_text: 'Hello {{rentalTenantName}}',
        body_html: '<p>Hello {{rentalTenantName}}</p>', variables_json: [],
        is_active: true, notification_class: 'OPERATIONAL',
      },
      {
        // The SMS leg needs its own row: the template lookup runs BEFORE the gate, so a
        // missing template marks the row FAILED/TEMPLATE_NOT_FOUND and it never reaches
        // the suppression path at all.
        tenant_id: null, template_code: 'INSPECTION_NOTICE_SMS', channel: 'SMS',
        subject: null, body_text: 'Hello {{rentalTenantName}}',
        body_html: null, variables_json: [],
        is_active: true, notification_class: 'OPERATIONAL',
      },
      {
        tenant_id: null, template_code: 'TENANT_NOTICE_FORWARDED_AGENCY', channel: 'EMAIL',
        subject: 'Tenant notice not sent - {{propertyAddress}}',
        body_text: 'Not sent: {{suppressedTemplateLabel}} ({{suppressedChannel}}) for {{appointmentCode}}',
        body_html: '<p>Not sent: {{suppressedTemplateLabel}}</p>', variables_json: [],
        is_active: true, notification_class: 'TRANSACTIONAL',
      },
    ],
  });

  sut = buildPipeline();
});

async function createOccupantNotification(channel: 'EMAIL' | 'SMS', templateCode: string) {
  const { notificationId } = await sut.createNotification.execute({
    tenantId,
    appointmentId,
    recipient: channel === 'EMAIL' ? 'tenant@example.com' : '+61412345678',
    channel,
    templateCode,
    payloadJson: { rentalTenantName: 'John Smith' },
  });
  return notificationId;
}

describe('agency mirror, end to end', () => {
  it('withholds the occupant email and persists a mirror to the branch contact', async () => {
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');

    await sut.sendNotification.execute({ notificationId });

    expect(sut.emailProvider.send).not.toHaveBeenCalled();

    const original = await harness.prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    expect(original.status).toBe('SKIPPED_OPT_OUT');
    expect(original.failure_reason).toBe('AGENCY_TENANT_NOTIFICATIONS_DISABLED');

    const mirror = await harness.prisma.notification.findFirstOrThrow({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });
    expect(mirror.recipient).toBe('branch@agency.example');
    expect(mirror.channel).toBe('EMAIL');
    expect(mirror.tenant_id).toBe(tenantId);
    expect(mirror.appointment_id).toBe(appointmentId);
    // TRANSACTIONAL, resolved from the shared catalogue by CreateNotificationUseCase,
    // so a branch contact's opt-out cannot silence both parties.
    expect(mirror.notification_class).toBe('TRANSACTIONAL');

    const payload = mirror.payload_json as Record<string, string>;
    expect(payload.suppressedTemplateLabel).toBe('Inspection Notice');
    expect(payload.suppressedChannel).toBe('EMAIL');
    expect(payload.propertyAddress).toBe('123 Flower St, Sydney NSW 2000');
    expect(payload.branchName).toBe('Sydney CBD');
  });

  it('mirrors a withheld SMS as email, with the address the SMS payload lacked', async () => {
    const notificationId = await createOccupantNotification('SMS', 'INSPECTION_NOTICE_SMS');

    await sut.sendNotification.execute({ notificationId });

    expect(sut.smsProvider.send).not.toHaveBeenCalled();
    const mirror = await harness.prisma.notification.findFirstOrThrow({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });
    expect(mirror.channel).toBe('EMAIL');
    const payload = mirror.payload_json as Record<string, string>;
    expect(payload.suppressedChannel).toBe('SMS');
    expect(payload.suppressedTemplateLabel).toBe('Inspection Notice (SMS)');
    expect(payload.propertyAddress).toBe('123 Flower St, Sydney NSW 2000');
  });

  it('sends the mirror itself instead of suppressing it, so it cannot loop', async () => {
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');
    await sut.sendNotification.execute({ notificationId });

    const mirror = await harness.prisma.notification.findFirstOrThrow({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });
    await sut.sendNotification.execute({ notificationId: mirror.id });

    expect(sut.emailProvider.send).toHaveBeenCalledTimes(1);
    const sentMirror = await harness.prisma.notification.findUniqueOrThrow({ where: { id: mirror.id } });
    expect(sentMirror.status).toBe('SENT');
    // Exactly one mirror: sending it must not produce a mirror of the mirror.
    const mirrors = await harness.prisma.notification.count({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });
    expect(mirrors).toBe(1);
  });

  it('records on the row, and warns on its own metric, when the branch has no email', async () => {
    await harness.prisma.branch.updateMany({
      where: { tenant_id: tenantId },
      data: { contact_email: null },
    });
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');

    await sut.sendNotification.execute({ notificationId });

    const original = await harness.prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    expect(original.failure_reason).toBe('AGENCY_FORWARD_NO_BRANCH_EMAIL');
    expect(sut.metrics.incrementAgencyForwardFailedCount).toHaveBeenCalled();
    expect(
      await harness.prisma.notification.count({ where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' } }),
    ).toBe(0);
  });

  it('fails closed without a recipient lookup or mirror when the suppressed row has no tenant scope', async () => {
    sut = buildPipeline({ rentalTenantNotificationsEnabled: false });
    const { notificationId } = await sut.createNotification.execute({
      tenantId: null,
      appointmentId,
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      templateCode: 'INSPECTION_NOTICE',
      payloadJson: { rentalTenantName: 'John Smith' },
    });

    await sut.sendNotification.execute({ notificationId });

    const original = await harness.prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(original.status).toBe('SKIPPED_OPT_OUT');
    expect(original.failure_reason).toBe('AGENCY_FORWARD_NO_TENANT');
    expect(sut.getAgencyForwardRecipient).not.toHaveBeenCalled();
    expect(
      await harness.prisma.notification.count({
        where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
      }),
    ).toBe(0);
  });

  it('recovers the mirror on redelivery after a crash, without duplicating it', async () => {
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');
    // Simulate the crash window: suppression persisted, mirror never inserted.
    await harness.prisma.notification.update({
      where: { id: notificationId },
      data: { status: 'SKIPPED_OPT_OUT', failure_reason: 'AGENCY_TENANT_NOTIFICATIONS_DISABLED' },
    });

    await sut.sendNotification.execute({ notificationId });
    // A further redelivery is a recognised no-op, not a DLQ entry and not a duplicate.
    await expect(sut.sendNotification.execute({ notificationId })).resolves.toBeUndefined();

    expect(
      await harness.prisma.notification.count({ where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' } }),
    ).toBe(1);
  });

  it('recovers a later message even though earlier ones are already mirrored', async () => {
    // The real shape of a blocked appointment: one mirror per withheld message. Keying
    // recovery on the appointment reported messages 2..N as already handled and silently
    // dropped their mirrors, which is the pre-fix behaviour this pins against.
    const first = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');
    await sut.sendNotification.execute({ notificationId: first });

    const second = await createOccupantNotification('SMS', 'INSPECTION_NOTICE_SMS');
    // Crash window on the SECOND message: suppressed, mirror never inserted.
    await harness.prisma.notification.update({
      where: { id: second },
      data: { status: 'SKIPPED_OPT_OUT', failure_reason: 'AGENCY_TENANT_NOTIFICATIONS_DISABLED' },
    });

    await expect(sut.sendNotification.execute({ notificationId: second })).resolves.toBeUndefined();

    const mirrors = await harness.prisma.notification.findMany({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
      orderBy: { created_at: 'asc' },
    });
    expect(mirrors).toHaveLength(2);
    expect(mirrors.map((m) => (m.payload_json as Record<string, string>).suppressedNotificationId))
      .toEqual([first, second]);
  });

  it('ties each mirror to the message it stands in for', async () => {
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');

    await sut.sendNotification.execute({ notificationId });

    const mirror = await harness.prisma.notification.findFirstOrThrow({
      where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' },
    });
    expect((mirror.payload_json as Record<string, string>).suppressedNotificationId).toBe(notificationId);
  });

  it('leaves an unblocked agency untouched', async () => {
    await harness.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings_json: { rentalTenantNotificationsEnabled: true } },
    });
    const notificationId = await createOccupantNotification('EMAIL', 'INSPECTION_NOTICE');

    await sut.sendNotification.execute({ notificationId });

    expect(sut.emailProvider.send).toHaveBeenCalledTimes(1);
    expect(
      await harness.prisma.notification.count({ where: { template_code: 'TENANT_NOTICE_FORWARDED_AGENCY' } }),
    ).toBe(0);
  });
});
