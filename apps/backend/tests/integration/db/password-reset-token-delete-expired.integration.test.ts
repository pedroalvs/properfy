/**
 * Real-database test for PrismaPasswordResetTokenRepository.deleteExpired (#561).
 * The prior where-clause `{ expires_at: { lt: now }, used_at: { not: null } }`
 * only purged expired tokens that had ALSO been used, so expired-but-never-used
 * tokens accumulated forever. deleteExpired must now drop every expired row
 * regardless of used_at, while leaving still-valid tokens untouched.
 *
 * Run via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/password-reset-token-delete-expired.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaPasswordResetTokenRepository } from '../../../src/modules/auth/infrastructure/prisma-password-reset-token.repository';

let harness: DbHarness;
let repo: PrismaPasswordResetTokenRepository;
let userId: string;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaPasswordResetTokenRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

beforeEach(async () => {
  await harness.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE password_reset_tokens, users CASCADE`,
  );
  userId = crypto.randomUUID();
  await harness.prisma.user.create({
    data: {
      id: userId,
      tenant_id: null,
      branch_id: null,
      role: 'AM',
      name: 'Reset User',
      email: `reset-${userId}@x.com`,
      phone: null,
      status: 'ACTIVE',
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
      deleted_at: null,
    },
  });
});

async function seedToken(id: string, expiresAt: Date, usedAt: Date | null): Promise<void> {
  await harness.prisma.passwordResetToken.create({
    data: { id, user_id: userId, token_hash: `hash-${id}`, expires_at: expiresAt, used_at: usedAt },
  });
}

describe('PrismaPasswordResetTokenRepository.deleteExpired (#561)', () => {
  it('deletes expired tokens whether or not they were used, and keeps valid ones', async () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const future = new Date(Date.now() + 60 * 60 * 1000);

    await seedToken('expired-unused', past, null); // the one the old query wrongly kept
    await seedToken('expired-used', past, new Date());
    await seedToken('valid-unused', future, null);

    const deleted = await repo.deleteExpired();
    expect(deleted).toBe(2);

    const remaining = await harness.prisma.passwordResetToken.findMany();
    expect(remaining.map((t) => t.id)).toEqual(['valid-unused']);
  });
});
