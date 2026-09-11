/**
 * Real-database concurrency proof for PrismaUserRepository.incrementFailedLogin
 * (#246). N concurrent failed-login increments on the same row must produce a
 * final count of exactly N and flip the account to LOCKED precisely at the
 * threshold. The previous read-modify-write (`failedLoginCount + 1` computed in
 * the use case, then written) loses increments under concurrency; the
 * single-statement `UPDATE ... SET failed_login_count = failed_login_count + 1`
 * does not, so this test fails against the old design.
 *
 * Run via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/user-increment-failed-login-concurrency.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaUserRepository } from '../../../src/modules/auth/infrastructure/prisma-user.repository';

let harness: DbHarness;
let repo: PrismaUserRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaUserRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedActiveUser(): Promise<string> {
  const userId = crypto.randomUUID();
  await harness.prisma.user.create({
    data: {
      id: userId,
      tenant_id: null,
      branch_id: null,
      role: 'CL_ADMIN',
      name: 'Lock User',
      email: `lock-${userId}@x.com`,
      phone: null,
      status: 'ACTIVE',
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
      deleted_at: null,
    },
  });
  return userId;
}

const THRESHOLD = 5;
const LOCK_MS = 15 * 60 * 1000;

describe('PrismaUserRepository.incrementFailedLogin (concurrency)', () => {
  it('counts exactly N concurrent increments and locks at the threshold', async () => {
    const userId = await seedActiveUser();
    const N = 6;

    await Promise.all(
      Array.from({ length: N }, () => repo.incrementFailedLogin(userId, THRESHOLD, LOCK_MS)),
    );

    const row = await harness.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.failed_login_count).toBe(N); // no lost updates
    expect(row.status).toBe('LOCKED');
    expect(row.locked_until).not.toBeNull();
  });

  it('does not lock before the threshold is reached', async () => {
    const userId = await seedActiveUser();

    await Promise.all(
      Array.from({ length: THRESHOLD - 1 }, () =>
        repo.incrementFailedLogin(userId, THRESHOLD, LOCK_MS),
      ),
    );

    const row = await harness.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.failed_login_count).toBe(THRESHOLD - 1);
    expect(row.status).toBe('ACTIVE');
    expect(row.locked_until).toBeNull();
  });

  it('returns the post-update state from the atomic write', async () => {
    const userId = await seedActiveUser();
    const first = await repo.incrementFailedLogin(userId, THRESHOLD, LOCK_MS);
    expect(first).toMatchObject({ failedLoginCount: 1, status: 'ACTIVE', lockedUntil: null });
  });

  it('resetFailedLogin clears an expired lock back to ACTIVE', async () => {
    const userId = await seedActiveUser();
    // Drive it to LOCKED.
    await Promise.all(
      Array.from({ length: THRESHOLD }, () =>
        repo.incrementFailedLogin(userId, THRESHOLD, LOCK_MS),
      ),
    );
    await repo.resetFailedLogin(userId);
    const row = await harness.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.status).toBe('ACTIVE');
    expect(row.failed_login_count).toBe(0);
    expect(row.locked_until).toBeNull();
  });
});
