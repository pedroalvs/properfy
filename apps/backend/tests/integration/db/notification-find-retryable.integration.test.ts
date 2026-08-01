import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';

let harness: DbHarness;
let repo: PrismaNotificationRepository;
let tenantId: string;

const NOW = new Date('2026-07-31T12:00:00.000Z');
const DUE = new Date('2026-07-31T11:59:00.000Z');
const FUTURE = new Date('2026-07-31T12:01:00.000Z');

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaNotificationRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe('TRUNCATE TABLE notifications, tenants CASCADE');
  const tenant = await harness.prisma.tenant.create({
    data: {
      name: 'Retryable Agency',
      legal_name: 'Retryable Agency Pty Ltd',
      status: 'ACTIVE',
    },
  });
  tenantId = tenant.id;
});

async function seed(options: {
  status: 'PENDING' | 'SKIPPED_OPT_OUT';
  failureReason: string | null;
  retryCount?: number;
  nextRetryAt: Date | null;
}): Promise<string> {
  const row = await harness.prisma.notification.create({
    data: {
      tenant_id: tenantId,
      recipient: 'tenant@example.com',
      channel: 'EMAIL',
      template_code: 'INSPECTION_NOTICE',
      status: options.status,
      failure_reason: options.failureReason,
      retry_count: options.retryCount ?? 0,
      next_retry_at: options.nextRetryAt,
      payload_json: {},
    },
  });
  return row.id;
}

describe('PrismaNotificationRepository.findRetryable', () => {
  it('returns due PENDING retries and due agency-forward recovery rows', async () => {
    const pendingId = await seed({
      status: 'PENDING',
      failureReason: 'provider unavailable',
      retryCount: 1,
      nextRetryAt: DUE,
    });
    const suppressedId = await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'AGENCY_TENANT_NOTIFICATIONS_DISABLED',
      nextRetryAt: DUE,
    });
    const failedForwardId = await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'AGENCY_FORWARD_NO_BRANCH_EMAIL',
      retryCount: 2,
      nextRetryAt: DUE,
    });

    const result = await repo.findRetryable(NOW);

    expect(result.map((notification) => notification.id).sort()).toEqual(
      [pendingId, suppressedId, failedForwardId].sort(),
    );
  });

  it('excludes consent opt-outs, unrelated skipped rows, and agency rows not yet due', async () => {
    await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'CONSENT_OPT_OUT',
      nextRetryAt: DUE,
    });
    await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'UNRELATED_SKIP',
      nextRetryAt: DUE,
    });
    await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'AGENCY_FORWARD_FAILED',
      retryCount: 1,
      nextRetryAt: FUTURE,
    });
    await seed({
      status: 'SKIPPED_OPT_OUT',
      failureReason: 'AGENCY_TENANT_NOTIFICATIONS_DISABLED',
      nextRetryAt: null,
    });

    expect(await repo.findRetryable(NOW)).toEqual([]);
  });
});
