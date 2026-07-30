/**
 * Real-database test for platform-scoped notifications — rows with
 * `tenant_id NULL`, emitted for users who belong to no agency (INSP, AM, OP).
 *
 * This file exists because every failure mode here is invisible to a mock:
 *  - `notifications.tenant_id` was NOT NULL with an FK to `tenants`, so the old
 *    `?? 'platform'` literal raised P2003 and turned POST /v1/auth/forgot-password
 *    into a 500 for every tenant-less user.
 *  - `scrubPayload` scopes its UPDATE by tenant in raw SQL. `tenant_id = NULL` is
 *    UNKNOWN in SQL, so a plain `=` matches zero rows *without throwing* and the
 *    reset link would stay in `payload_json` forever.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { NotificationEntity } from '../../../src/modules/notification/domain/notification.entity';
import {
  SENSITIVE_PAYLOAD_KEYS,
  REDACTED_PAYLOAD_VALUE,
} from '../../../src/modules/notification/domain/notification.constants';
import { ValidationError } from '../../../src/shared/domain/errors';

let harness: DbHarness;
let repo: PrismaNotificationRepository;
let templateRepo: PrismaNotificationTemplateRepository;
let tenantId: string;

const RESET_LINK = 'https://pwa.example.com/reset-password?token=raw-secret';

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationRepository(harness.prisma);
  templateRepo = new PrismaNotificationTemplateRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE notifications, notification_templates, tenants CASCADE`,
  );
  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Platform Test Tenant',
      legal_name: `Platform LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;

  // Platform default template (tenant_id NULL) — the row a tenant-less user resolves.
  await harness.prisma.notificationTemplate.create({
    data: {
      tenant_id: null,
      template_code: 'PASSWORD_RESET',
      channel: 'EMAIL',
      subject: 'Reset your Properfy password',
      body_html: '<p>Hi {{userName}}, reset here: {{resetLink}}</p>',
      body_text: 'Hi {{userName}}, reset here: {{resetLink}}',
      variables_json: ['userName', 'resetLink'],
      is_active: true,
      notification_class: 'TRANSACTIONAL',
    },
  });
});

function makeEntity(overrides: Partial<ConstructorParameters<typeof NotificationEntity>[0]> = {}) {
  const now = new Date();
  return new NotificationEntity({
    id: crypto.randomUUID(),
    tenantId: null,
    appointmentId: null,
    recipient: 'inspector@example.com',
    channel: 'EMAIL',
    templateCode: 'PASSWORD_RESET',
    status: 'PENDING',
    notificationClass: 'TRANSACTIONAL',
    providerName: null,
    providerMessageId: null,
    sentAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    payloadJson: { userName: 'Jane', resetLink: RESET_LINK },
    retryCount: 0,
    nextRetryAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function seedRow(
  ownerTenantId: string | null,
  payloadJson: Record<string, unknown> = { userName: 'Jane', resetLink: RESET_LINK },
  channel: 'EMAIL' | 'SMS' = 'EMAIL',
): Promise<string> {
  const row = await harness.prisma.notification.create({
    data: {
      tenant_id: ownerTenantId,
      recipient: 'inspector@example.com',
      channel,
      template_code: 'PASSWORD_RESET',
      status: 'SENT',
      payload_json: payloadJson,
    },
  });
  return row.id;
}

async function readPayload(id: string): Promise<Record<string, unknown>> {
  const row = await harness.prisma.notification.findUniqueOrThrow({ where: { id } });
  return row.payload_json as Record<string, unknown>;
}

describe('platform-scoped notification persistence', () => {
  it('persists a notification with a null tenant_id', async () => {
    const entity = makeEntity();

    await repo.save(entity);

    const row = await harness.prisma.notification.findUniqueOrThrow({ where: { id: entity.id } });
    expect(row.tenant_id).toBeNull();
  });

  it('round-trips the null tenant back through findById', async () => {
    const entity = makeEntity();
    await repo.save(entity);

    const loaded = await repo.findById(entity.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.tenantId).toBeNull();
  });

  it('rejects a tenant id that does not exist (the FK is still enforced)', async () => {
    // The original bug: 'platform' is not a tenants.id. Widening the column to
    // NULL must not weaken the foreign key for non-null values.
    await expect(
      harness.prisma.$executeRawUnsafe(
        `INSERT INTO notifications (id, tenant_id, recipient, channel, template_code, status, payload_json, updated_at)
         VALUES (gen_random_uuid(), 'platform', 'a@b.c', 'EMAIL', 'PASSWORD_RESET', 'PENDING', '{}'::jsonb, now())`,
      ),
    ).rejects.toThrow(/notifications_tenant_id_fkey|foreign key/i);
  });
});

describe('CreateNotificationUseCase with a tenant-less user', () => {
  function makeUseCase() {
    const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const useCase = new CreateNotificationUseCase(repo, templateRepo, jobQueue as never);
    return { useCase, jobQueue };
  }

  it('creates a PASSWORD_RESET notification when the user has no tenant', async () => {
    const { useCase, jobQueue } = makeUseCase();

    const { notificationId } = await useCase.execute({
      tenantId: null,
      recipient: 'inspector@example.com',
      channel: 'EMAIL',
      templateCode: 'PASSWORD_RESET',
      payloadJson: { userName: 'Jane', resetLink: RESET_LINK },
    });

    const row = await harness.prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    expect(row.tenant_id).toBeNull();
    // The platform default template resolved, so the row is stamped TRANSACTIONAL
    // and the send worker's consent gate stays bypassed.
    expect(row.notification_class).toBe('TRANSACTIONAL');
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'notification.send',
      { notificationId },
      expect.anything(),
    );
  });

  it('still rejects an empty-string tenantId', async () => {
    const { useCase } = makeUseCase();

    await expect(
      useCase.execute({
        tenantId: '   ',
        recipient: 'inspector@example.com',
        channel: 'EMAIL',
        templateCode: 'PASSWORD_RESET',
        payloadJson: {},
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('scrubPayload on a platform notification', () => {
  it('redacts the payload of a notification with a null tenant', async () => {
    const id = await seedRow(null);

    await repo.scrubPayload(id, null, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({
      userName: 'Jane',
      resetLink: REDACTED_PAYLOAD_VALUE,
    });
  });

  it('a platform-scoped scrub cannot touch a tenant-owned row', async () => {
    const id = await seedRow(tenantId);

    await repo.scrubPayload(id, null, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({ userName: 'Jane', resetLink: RESET_LINK });
  });

  it('a tenant-scoped scrub cannot touch a platform row', async () => {
    const id = await seedRow(null);

    await repo.scrubPayload(id, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({ userName: 'Jane', resetLink: RESET_LINK });
  });
});

describe('countByTenantChannelSince with a null tenant', () => {
  it('counts platform rows in their own bucket, never mixed with a tenant bucket', async () => {
    const since = new Date(Date.now() - 60_000);
    await seedRow(null);
    await seedRow(null);
    await seedRow(tenantId);
    await seedRow(tenantId);
    await seedRow(tenantId);
    await seedRow(null, { userName: 'Jane' }, 'SMS');

    await expect(repo.countByTenantChannelSince(null, 'EMAIL', since)).resolves.toBe(2);
    await expect(repo.countByTenantChannelSince(tenantId, 'EMAIL', since)).resolves.toBe(3);
    await expect(repo.countByTenantChannelSince(null, 'SMS', since)).resolves.toBe(1);
  });
});
