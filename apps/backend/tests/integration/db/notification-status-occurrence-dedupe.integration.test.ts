/**
 * Real-database test for the occurrence-scoped dedupe of status-change
 * notifications.
 *
 * `NotifyOnStatusTransitionHandler` used to guard its sends with
 * `existsByAppointmentAndTemplate`, which counts every row ever created for the
 * pair — so an appointment could only ever receive one INSPECTION_NOTICE. A
 * rental tenant whose inspection was cancelled and then re-scheduled was never
 * told the new date. The dedupe now looks at the last announcement instead.
 *
 * This runs the real handler against real Prisma repositories, because the
 * decision depends on created_at ordering that a mock cannot exercise.
 *
 * Requires Docker (testcontainers). Run via: `pnpm --filter backend test:integration:db`
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { seedTenant } from '../service-region/helpers/service-region-fixtures';
import { PrismaAppointmentRepository } from '../../../src/modules/appointment/infrastructure/prisma-appointment.repository';
import { PrismaPropertyRepository } from '../../../src/modules/property/infrastructure/prisma-property.repository';
import { PrismaTenantRepository } from '../../../src/modules/tenant/infrastructure/prisma-tenant.repository';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { PrismaRentalTenantPortalTokenRepository } from '../../../src/modules/rental-tenant-portal/infrastructure/prisma-rental-tenant-portal-token.repository';
import { TokenService } from '../../../src/modules/rental-tenant-portal/domain/token.service';
import { MintPortalTokenService } from '../../../src/modules/rental-tenant-portal/domain/mint-portal-token.service';
import { BuildNotificationPayloadService } from '../../../src/modules/notification/domain/build-notification-payload.service';
import { AppointmentCodeFormatter } from '../../../src/modules/appointment/domain/appointment-code.formatter';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { NotifyOnStatusTransitionHandler } from '../../../src/modules/notification/application/handlers/notify-on-status-transition.handler';
import type { IJobQueue } from '../../../src/shared/domain/job-queue';

let harness: DbHarness;

beforeAll(async () => {
  harness = await setupDbHarness();
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, rental_tenant_portal_tokens, appointment_contacts, appointments, properties, service_types, users, branches, tenants CASCADE`,
  );
});

const SCHEDULED_DATE = new Date('2026-08-01T00:00:00.000Z');
const NEW_SCHEDULED_DATE = new Date('2026-09-15T00:00:00.000Z');

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

interface Fixture {
  appointmentId: string;
  tenantId: string;
}

async function seedFixture(prisma: PrismaClient, contactEmail: string | null = null): Promise<Fixture> {
  const { tenantId, userId } = await seedTenant(prisma, `Agency ${rand()}`);
  const branch = await prisma.branch.findFirstOrThrow({ where: { tenant_id: tenantId } });
  const serviceType = await prisma.serviceType.create({
    data: {
      code: `ST-${rand()}`,
      name: `Routine ${rand()}`,
      flow_type: 'ROUTINE',
      requires_rental_tenant_confirmation: true,
      status: 'ACTIVE',
    },
  });
  const property = await prisma.property.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_code: `P-${rand()}`, type: 'HOUSE',
      street: '1 Test St', suburb: 'Sydney', postcode: '2000', state: 'NSW', country: 'AU',
      geocoding_status: 'SUCCESS',
    },
  });
  const appointment = await prisma.appointment.create({
    data: {
      tenant_id: tenantId, branch_id: branch.id, property_id: property.id,
      service_type_id: serviceType.id, status: 'SCHEDULED',
      scheduled_date: SCHEDULED_DATE, time_slot_start: '09:00', time_slot_end: '12:00',
      price_amount: '100.00', payout_amount: '80.00', pricing_rule_snapshot_json: {},
      rental_tenant_confirmation_status: 'PENDING', created_by_user_id: userId,
    },
  });
  await prisma.appointmentContact.create({
    data: {
      appointment_id: appointment.id, role: 'RENTAL_TENANT', is_primary: true,
      snapshot_name: 'Renter Test',
      snapshot_email: contactEmail ?? `renter-${rand()}@test.local`,
      snapshot_phone: '+61400000001',
    },
  });
  return { appointmentId: appointment.id, tenantId };
}

function makeHandler(prisma: PrismaClient): NotifyOnStatusTransitionHandler {
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as IJobQueue;
  return new NotifyOnStatusTransitionHandler(
    new PrismaAppointmentRepository(prisma),
    new PrismaPropertyRepository(prisma),
    new PrismaTenantRepository(prisma),
    notificationRepo,
    new MintPortalTokenService(new PrismaRentalTenantPortalTokenRepository(prisma), new TokenService()),
    new BuildNotificationPayloadService(),
    new AppointmentCodeFormatter(),
    new CreateNotificationUseCase(
      notificationRepo,
      new PrismaNotificationTemplateRepository(prisma),
      jobQueue,
    ),
    'http://portal.test',
  );
}

async function templateCodesFor(appointmentId: string): Promise<string[]> {
  const rows = await harness.prisma.notification.findMany({
    where: { appointment_id: appointmentId },
    orderBy: { created_at: 'asc' },
  });
  return rows.map((r) => r.template_code);
}

describe('status-change notification dedupe — real DB', () => {
  it('notifies again when a cancelled appointment is re-scheduled for the same date', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const handler = makeHandler(harness.prisma);

    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });
    await handler.execute({
      appointmentId, tenantId, previousStatus: 'SCHEDULED', targetStatus: 'CANCELLED',
    });
    await handler.execute({
      appointmentId, tenantId, previousStatus: 'CANCELLED', targetStatus: 'SCHEDULED',
    });

    expect(await templateCodesFor(appointmentId)).toEqual([
      'INSPECTION_NOTICE',
      'INSPECTION_CANCELLED',
      'INSPECTION_NOTICE',
    ]);
  });

  it('notifies again when the appointment returns to SCHEDULED with a new date', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const handler = makeHandler(harness.prisma);

    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });
    // Rejected then re-accepted on a different date — status returns to SCHEDULED
    // without any cancellation ever being announced.
    await harness.prisma.appointment.update({
      where: { id: appointmentId },
      data: { scheduled_date: NEW_SCHEDULED_DATE },
    });
    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });

    const rows = await harness.prisma.notification.findMany({
      where: { appointment_id: appointmentId },
      orderBy: { created_at: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect((rows[0]!.payload_json as Record<string, string>).scheduledDate).toBe('2026-08-01');
    expect((rows[1]!.payload_json as Record<string, string>).scheduledDate).toBe('2026-09-15');
  });

  it('suppresses a replay of the same announcement and does not mint a second token', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const handler = makeHandler(harness.prisma);

    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });
    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });

    expect(await templateCodesFor(appointmentId)).toEqual(['INSPECTION_NOTICE']);
    const tokens = await harness.prisma.rentalTenantPortalToken.count({
      where: { appointment_id: appointmentId },
    });
    expect(tokens).toBe(1);
  });

  it('recognises the SMS variant as the same announcement', async () => {
    // Contact without an email falls back to INSPECTION_NOTICE_SMS; the replay
    // must still be suppressed even though the stored code carries the suffix.
    const { appointmentId, tenantId } = await seedFixture(harness.prisma, null);
    await harness.prisma.appointmentContact.updateMany({
      where: { appointment_id: appointmentId },
      data: { snapshot_email: null },
    });
    const handler = makeHandler(harness.prisma);

    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });
    await handler.execute({
      appointmentId, tenantId, previousStatus: 'AWAITING_INSPECTOR', targetStatus: 'SCHEDULED',
    });

    expect(await templateCodesFor(appointmentId)).toEqual(['INSPECTION_NOTICE_SMS']);
  });
});

describe('findLatestByAppointmentAndTemplates — real DB', () => {
  const FAMILY = [
    'INSPECTION_NOTICE',
    'INSPECTION_NOTICE_SMS',
    'INSPECTION_CANCELLED',
    'INSPECTION_CANCELLED_SMS',
  ];

  async function seedNotification(
    appointmentId: string,
    tenantId: string,
    templateCode: string,
    createdAt: Date,
  ): Promise<string> {
    const row = await harness.prisma.notification.create({
      data: {
        tenant_id: tenantId, appointment_id: appointmentId, recipient: 'renter@test.local',
        channel: 'EMAIL', template_code: templateCode, status: 'SENT',
        payload_json: { scheduledDate: '2026-08-01' }, created_at: createdAt,
      },
    });
    return row.id;
  }

  it('returns the newest matching row and ignores unrelated codes and appointments', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const other = await seedFixture(harness.prisma);
    const repo = new PrismaNotificationRepository(harness.prisma);

    await seedNotification(appointmentId, tenantId, 'INSPECTION_NOTICE', new Date('2026-07-01'));
    const newest = await seedNotification(
      appointmentId, tenantId, 'INSPECTION_CANCELLED', new Date('2026-07-02'),
    );
    // A later reminder is outside the family and must not win.
    await seedNotification(appointmentId, tenantId, 'REMINDER_7_DAYS', new Date('2026-07-03'));
    // A later announcement on another appointment must not leak in.
    await seedNotification(
      other.appointmentId, other.tenantId, 'INSPECTION_NOTICE', new Date('2026-07-04'),
    );

    const latest = await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, FAMILY);

    expect(latest?.id).toBe(newest);
    expect(latest?.templateCode).toBe('INSPECTION_CANCELLED');
  });

  it('returns null when the appointment has no notification in the family', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const repo = new PrismaNotificationRepository(harness.prisma);
    await seedNotification(appointmentId, tenantId, 'REMINDER_7_DAYS', new Date('2026-07-01'));

    expect(
      await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, FAMILY),
    ).toBeNull();
  });

  it('returns null for an empty template list without querying', async () => {
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const repo = new PrismaNotificationRepository(harness.prisma);
    await seedNotification(appointmentId, tenantId, 'INSPECTION_NOTICE', new Date('2026-07-01'));

    expect(await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, [])).toBeNull();
  });

  it('does not read a row stamped with another tenant', async () => {
    // Defense in depth: notifications are always stamped with their own
    // appointment's tenant, so this state should not arise — but the WHERE
    // clause must enforce it rather than trust the invariant. Only a real
    // Postgres query can prove the filter is present.
    const { appointmentId, tenantId } = await seedFixture(harness.prisma);
    const foreign = await seedFixture(harness.prisma);
    const repo = new PrismaNotificationRepository(harness.prisma);

    await seedNotification(
      appointmentId, foreign.tenantId, 'INSPECTION_NOTICE', new Date('2026-07-01'),
    );

    expect(
      await repo.findLatestByAppointmentAndTemplates(appointmentId, tenantId, FAMILY),
    ).toBeNull();
  });
});
