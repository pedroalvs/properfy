/**
 * Real-database test for PrismaNotificationRepository.scrubPayload, the jsonb
 * merge behind post-send secret redaction. Verifies against Postgres that only
 * the listed keys are overwritten, other keys are preserved, absent keys are a
 * no-op, and rows other than the target are untouched — a mock can't catch a
 * wrong jsonb expression here.
 *
 * Requires Docker (testcontainers). Run via:
 *   pnpm --filter backend test:integration:db
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import {
  SENSITIVE_PAYLOAD_KEYS,
  REDACTED_PAYLOAD_VALUE,
} from '../../../src/modules/notification/domain/notification.constants';

let harness: DbHarness;
let repo: PrismaNotificationRepository;
let tenantId: string;

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
      name: 'Scrub Tenant',
      legal_name: `Scrub LLC ${Math.random().toString(36).slice(2, 10)}`,
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;
});

async function seedNotification(
  payloadJson: Record<string, unknown>,
  ownerTenantId: string = tenantId,
): Promise<string> {
  const row = await harness.prisma.notification.create({
    data: {
      tenant_id: ownerTenantId,
      recipient: 'user@example.com',
      channel: 'EMAIL',
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

describe('scrubPayload', () => {
  it('redacts only the listed keys and preserves the rest of the payload', async () => {
    const id = await seedNotification({
      userName: 'John Smith',
      resetLink: 'https://app.example.com/reset-password?token=deadbeef',
      confirmationLink: 'https://portal.example.com/portal/rawtoken',
    });

    await repo.scrubPayload(id, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({
      userName: 'John Smith',
      resetLink: REDACTED_PAYLOAD_VALUE,
      confirmationLink: REDACTED_PAYLOAD_VALUE,
    });
  });

  it('is a no-op when the payload has none of the listed keys', async () => {
    const id = await seedNotification({ rentalTenantName: 'Jane', scheduledDate: '2026-08-01' });

    await repo.scrubPayload(id, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({
      rentalTenantName: 'Jane',
      scheduledDate: '2026-08-01',
    });
  });

  it('does not touch other rows', async () => {
    const target = await seedNotification({ resetLink: 'https://a/reset?token=1' });
    const other = await seedNotification({ resetLink: 'https://a/reset?token=2' });

    await repo.scrubPayload(target, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(target)).toEqual({ resetLink: REDACTED_PAYLOAD_VALUE });
    expect(await readPayload(other)).toEqual({ resetLink: 'https://a/reset?token=2' });
  });

  it('handles an empty payload object', async () => {
    const id = await seedNotification({});

    await repo.scrubPayload(id, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(id)).toEqual({});
  });

  it('cannot alter a row belonging to another tenant', async () => {
    const otherTenant = await harness.prisma.tenant.create({
      data: {
        name: 'Other Tenant',
        legal_name: `Other LLC ${Math.random().toString(36).slice(2, 10)}`,
        status: 'ACTIVE',
      },
    });
    const foreignRow = await seedNotification(
      { resetLink: 'https://a/reset?token=foreign' },
      otherTenant.id,
    );

    // Scrub scoped to tenantId must not touch a row owned by otherTenant.
    await repo.scrubPayload(foreignRow, tenantId, SENSITIVE_PAYLOAD_KEYS, REDACTED_PAYLOAD_VALUE);

    expect(await readPayload(foreignRow)).toEqual({ resetLink: 'https://a/reset?token=foreign' });
  });
});

describe('backfill migration semantics (20260721000000_scrub_notification_payload_secrets)', () => {
  const migrationSql = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20260721000000_scrub_notification_payload_secrets/migration.sql',
    ),
    'utf8',
  );

  async function seedWithStatus(
    status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED_OPT_OUT',
    payloadJson: Record<string, unknown>,
  ): Promise<string> {
    const row = await harness.prisma.notification.create({
      data: {
        tenant_id: tenantId,
        recipient: 'user@example.com',
        channel: 'EMAIL',
        template_code: 'PASSWORD_RESET',
        status,
        payload_json: payloadJson,
      },
    });
    return row.id;
  }

  it('scrubs SENT and FAILED rows but leaves PENDING rows intact', async () => {
    const pending = await seedWithStatus('PENDING', { userName: 'A', resetToken: 'raw-1' });
    const sent = await seedWithStatus('SENT', { userName: 'B', resetToken: 'raw-2' });
    const failed = await seedWithStatus('FAILED', {
      userName: 'C',
      confirmationLink: 'https://portal/x?token=raw-3',
    });
    const untouched = await seedWithStatus('SENT', { rentalTenantName: 'D' });

    await harness.prisma.$executeRawUnsafe(migrationSql);

    expect(await readPayload(pending)).toEqual({ userName: 'A', resetToken: 'raw-1' });
    expect(await readPayload(sent)).toEqual({ userName: 'B', resetToken: '[REDACTED]' });
    expect(await readPayload(failed)).toEqual({ userName: 'C', confirmationLink: '[REDACTED]' });
    expect(await readPayload(untouched)).toEqual({ rentalTenantName: 'D' });
  });

  it('redacts all five sensitive keys on any non-PENDING status', async () => {
    const allKeys = {
      userName: 'E',
      resetLink: 'https://a/reset?token=1',
      resetToken: 'raw-token',
      confirmationLink: 'https://portal/x?token=2',
      rescheduleLink: 'https://portal/x/reschedule?token=3',
      inviteToken: 'raw-invite',
    };
    const skipped = await seedWithStatus('SKIPPED_OPT_OUT', allKeys);

    await harness.prisma.$executeRawUnsafe(migrationSql);

    expect(await readPayload(skipped)).toEqual({
      userName: 'E',
      resetLink: '[REDACTED]',
      resetToken: '[REDACTED]',
      confirmationLink: '[REDACTED]',
      rescheduleLink: '[REDACTED]',
      inviteToken: '[REDACTED]',
    });
  });
});
