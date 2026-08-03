import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness;
let repo: PrismaNotificationRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe('TRUNCATE TABLE notifications CASCADE');
});

describe('PrismaNotificationRepository.saveIfAbsent', () => {
  it('atomically reports one insertion for concurrent calls with the same deterministic ID', async () => {
    const notificationId = '9a1d6ac5-ef86-517f-9e7a-dc2d96b3ddce';
    const now = new Date('2026-07-31T00:00:00.000Z');
    const notification = new NotificationEntity({
      id: notificationId,
      tenantId: null,
      appointmentId: null,
      recipient: 'agency@example.com',
      channel: 'EMAIL',
      templateCode: 'TENANT_NOTICE_FORWARDED_AGENCY',
      status: 'PENDING',
      notificationClass: 'TRANSACTIONAL',
      providerName: null,
      providerMessageId: null,
      sentAt: null,
      deliveredAt: null,
      failedAt: null,
      failureReason: null,
      payloadJson: { suppressedNotificationId: 'notif-1' },
      retryCount: 0,
      nextRetryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const results = await Promise.all(
      Array.from({ length: 8 }, () => repo.saveIfAbsent(notification)),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await harness.prisma.notification.count({ where: { id: notificationId } })).toBe(1);
  });
});
