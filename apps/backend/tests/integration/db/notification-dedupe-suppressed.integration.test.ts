/**
 * Real-database test for the three send-dedupe predicates on
 * PrismaNotificationRepository, against Postgres.
 *
 * These are Prisma `where` clauses — a mocked repository cannot catch a missing status
 * filter, which is exactly the defect this file pins. A `SKIPPED_OPT_OUT` row means the
 * message was NEVER delivered, so it must not satisfy "already sent"; otherwise an agency
 * that blocks tenant notifications and later re-enables them never gets the initial notice
 * or the reminders re-dispatched, and RetryNotificationUseCase cannot replay them either
 * (it accepts FAILED only).
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';

let harness: DbHarness;
let repo: PrismaNotificationRepository;
let tenantId: string;
// `notifications.appointment_id` is a real FK, so the rows need a real appointment.
let appointmentId: string;

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
  const seeded = await seedTenant(harness.prisma, `Dedupe Agency ${rand()}`);
  tenantId = seeded.tenantId;

  const branch = await harness.prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
  const serviceType = await harness.prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: `Routine ${rand()}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const property = await harness.prisma.property.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      property_code: `P-${rand()}`,
      type: 'HOUSE',
      street: '1 Test St',
      suburb: 'Sydney',
      postcode: '2000',
      state: 'NSW',
    },
  });
  const appointment = await harness.prisma.appointment.create({
    data: {
      tenant_id: tenantId,
      branch_id: branch.id,
      property_id: property.id,
      service_type_id: serviceType.id,
      status: 'AWAITING_INSPECTOR',
      scheduled_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      time_slot_start: '09:00',
      time_slot_end: '12:00',
      price_amount: '100.00',
      payout_amount: '80.00',
      pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING',
      created_by_user_id: seeded.userId,
    },
  });
  appointmentId = appointment.id;
});

async function seed(
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED' | 'SKIPPED_OPT_OUT',
  templateCode = 'INSPECTION_NOTICE',
  failureReason: string | null = null,
): Promise<string> {
  const row = await harness.prisma.notification.create({
    data: {
      tenant_id: tenantId,
      appointment_id: appointmentId,
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      template_code: templateCode,
      status,
      failure_reason: failureReason,
      payload_json: {},
    },
  });
  return row.id;
}

describe('send-dedupe predicates ignore suppressed rows', () => {
  describe('existsByAppointmentAndTemplate (reminders, escalations, portal-action)', () => {
    it('does not count a row suppressed by the agency switch', async () => {
      await seed('SKIPPED_OPT_OUT', 'REMINDER_7_DAYS', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');

      expect(await repo.existsByAppointmentAndTemplate(appointmentId, 'REMINDER_7_DAYS')).toBe(false);
    });

    it('does not count a row suppressed by recipient consent either', async () => {
      // Same reasoning: the recipient never received it. The pre-existing hole was
      // invisible because consent opt-outs are effectively never reversed.
      await seed('SKIPPED_OPT_OUT', 'REMINDER_7_DAYS', 'CONSENT_OPT_OUT');

      expect(await repo.existsByAppointmentAndTemplate(appointmentId, 'REMINDER_7_DAYS')).toBe(false);
    });

    it.each(['PENDING', 'SENT', 'DELIVERED', 'FAILED'] as const)(
      'still counts a %s row, so a real send is never duplicated',
      async (status) => {
        await seed(status, 'REMINDER_7_DAYS');

        expect(await repo.existsByAppointmentAndTemplate(appointmentId, 'REMINDER_7_DAYS')).toBe(true);
      },
    );

    it('counts a real send that sits alongside a suppressed one', async () => {
      await seed('SKIPPED_OPT_OUT', 'REMINDER_7_DAYS', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');
      await seed('SENT', 'REMINDER_7_DAYS');

      expect(await repo.existsByAppointmentAndTemplate(appointmentId, 'REMINDER_7_DAYS')).toBe(true);
    });
  });

  describe('existsByAppointmentAndTemplates (does the tenant know about this inspection?)', () => {
    const CODES = ['INSPECTION_NOTICE', 'INSPECTION_NOTICE_SMS', 'TENANT_PORTAL_LINK'] as const;

    it('reports the tenant as uninformed when the notice was suppressed', async () => {
      // Drives the cancellation double-gate: a tenant who was never told about the
      // inspection must not receive a cancellation notice for it.
      await seed('SKIPPED_OPT_OUT', 'INSPECTION_NOTICE', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');

      expect(await repo.existsByAppointmentAndTemplates(appointmentId, tenantId, CODES)).toBe(false);
    });

    it('reports the tenant as informed when any notice actually went out', async () => {
      await seed('SKIPPED_OPT_OUT', 'INSPECTION_NOTICE', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');
      await seed('SENT', 'TENANT_PORTAL_LINK');

      expect(await repo.existsByAppointmentAndTemplates(appointmentId, tenantId, CODES)).toBe(true);
    });
  });

  describe('countByTenantChannelSince (daily budget cap)', () => {
    const SINCE = new Date('2020-01-01T00:00:00.000Z');

    it('does not charge the agency for a message it was never allowed to send', async () => {
      // SKIPPED_OPT_OUT is a DISTINCT enum value from SKIPPED, so the original
      // `not: 'SKIPPED'` counted every suppressed row. A blocked agency then burned its
      // quota on nothing and, once exhausted, the budget check FAILs its OWN mail
      // (escalation, report-ready, password reset) with no retry.
      await seed('SKIPPED_OPT_OUT', 'INSPECTION_NOTICE', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');
      await seed('SKIPPED_OPT_OUT', 'REMINDER_7_DAYS', 'CONSENT_OPT_OUT');

      expect(await repo.countByTenantChannelSince(tenantId, 'EMAIL', SINCE)).toBe(0);
    });

    it('does not charge the agency for the mirrors its own suppression produced', async () => {
      // One mirror per withheld message, so counting them would let mirror traffic
      // exhaust the very cap that then blocks the agency's own mail.
      await seed('SENT', 'TENANT_NOTICE_FORWARDED_AGENCY');
      await seed('SENT', 'TENANT_NOTICE_FORWARDED_AGENCY');

      expect(await repo.countByTenantChannelSince(tenantId, 'EMAIL', SINCE)).toBe(0);
    });

    it('still charges for real sends, including retryable failures', async () => {
      await seed('SENT', 'INSPECTION_NOTICE');
      await seed('DELIVERED', 'REMINDER_7_DAYS');
      await seed('PENDING', 'REMINDER_5_DAYS');
      await seed('FAILED', 'REMINDER_3_DAYS');

      expect(await repo.countByTenantChannelSince(tenantId, 'EMAIL', SINCE)).toBe(4);
    });

    it('keeps excluding the pre-existing SKIPPED status', async () => {
      await seed('SKIPPED', 'INSPECTION_NOTICE');

      expect(await repo.countByTenantChannelSince(tenantId, 'EMAIL', SINCE)).toBe(0);
    });
  });

  describe('findLatestByAppointmentAndTemplates (status-transition replay check)', () => {
    const CODES = ['INSPECTION_NOTICE', 'INSPECTION_NOTICE_SMS'] as const;

    it('skips a suppressed row so the announcement can be re-made', async () => {
      await seed('SKIPPED_OPT_OUT', 'INSPECTION_NOTICE', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');

      expect(await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, CODES)).toBeNull();
    });

    it('returns the latest genuinely-sent row, not a newer suppressed one', async () => {
      // Ordering is by created_at desc, so a suppressed row written after a real send
      // would otherwise become "the latest announcement" and drive the dedupe compare.
      const sent = await seed('SENT', 'INSPECTION_NOTICE');
      await new Promise((r) => setTimeout(r, 10));
      await seed('SKIPPED_OPT_OUT', 'INSPECTION_NOTICE_SMS', 'AGENCY_TENANT_NOTIFICATIONS_DISABLED');

      const latest = await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, CODES);

      expect(latest?.id).toBe(sent);
    });
  });
});
