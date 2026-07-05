/**
 * Real-database test for PrismaNotificationRepository.findSmsAwaitingDeliveryReceipt,
 * the query behind the notification.sms-delivery-poll reconciliation job.
 *
 * Verifies the inclusive [from, to] sent_at window, the channel/status/
 * provider_message_id filters, ordering and the batch limit against Postgres —
 * mocks can't catch an inverted boundary here, and a wrong window means SMS
 * rows silently stuck in SENT.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { NotificationChannel, NotificationStatus } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';

let harness: DbHarness;
let repo: PrismaNotificationRepository;
let tenantId: string;

const NOW = new Date('2026-07-05T12:00:00Z');
const FROM = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
const TO = new Date(NOW.getTime() - 10 * 60 * 1000);

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(`TRUNCATE TABLE notifications, tenants CASCADE`);
  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Delivery Poll Tenant',
      legal_name: `Delivery Poll LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;
});

async function seedNotification(opts: {
  channel?: NotificationChannel;
  status?: NotificationStatus;
  sentAt?: Date | null;
  providerMessageId?: string | null;
}): Promise<string> {
  const row = await harness.prisma.notification.create({
    data: {
      tenant_id: tenantId,
      recipient: '+61412345678',
      channel: opts.channel ?? 'SMS',
      template_code: 'TENANT_SMS_ALERT',
      status: opts.status ?? 'SENT',
      provider_message_id:
        opts.providerMessageId === undefined
          ? `mm-${Math.random().toString(36).slice(2, 10)}`
          : opts.providerMessageId,
      sent_at: opts.sentAt === undefined ? new Date(NOW.getTime() - 60 * 60 * 1000) : opts.sentAt,
      payload_json: {},
    },
  });
  return row.id;
}

describe('findSmsAwaitingDeliveryReceipt', () => {
  it('returns SENT SMS rows inside the window, oldest first', async () => {
    const older = await seedNotification({ sentAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000) });
    const newer = await seedNotification({ sentAt: new Date(NOW.getTime() - 30 * 60 * 1000) });

    const rows = await repo.findSmsAwaitingDeliveryReceipt(FROM, TO);

    expect(rows.map((r) => r.id)).toEqual([older, newer]);
  });

  it('window boundaries are inclusive on both ends', async () => {
    const atFrom = await seedNotification({ sentAt: FROM });
    const atTo = await seedNotification({ sentAt: TO });

    const rows = await repo.findSmsAwaitingDeliveryReceipt(FROM, TO);

    expect(rows.map((r) => r.id).sort()).toEqual([atFrom, atTo].sort());
  });

  it('excludes rows outside the window (too old / too recent)', async () => {
    await seedNotification({ sentAt: new Date(FROM.getTime() - 1000) });
    await seedNotification({ sentAt: new Date(TO.getTime() + 1000) });

    expect(await repo.findSmsAwaitingDeliveryReceipt(FROM, TO)).toEqual([]);
  });

  it('excludes non-SMS channels, non-SENT statuses and rows without provider_message_id', async () => {
    await seedNotification({ channel: 'EMAIL' });
    await seedNotification({ status: 'DELIVERED' });
    await seedNotification({ status: 'FAILED' });
    await seedNotification({ status: 'PENDING', sentAt: null });
    await seedNotification({ providerMessageId: null });
    const eligible = await seedNotification({});

    const rows = await repo.findSmsAwaitingDeliveryReceipt(FROM, TO);

    expect(rows.map((r) => r.id)).toEqual([eligible]);
  });

  it('respects the batch limit', async () => {
    await seedNotification({});
    await seedNotification({});
    await seedNotification({});

    expect(await repo.findSmsAwaitingDeliveryReceipt(FROM, TO, 2)).toHaveLength(2);
  });
});
