/**
 * Real-database proof for #261 (real session activity tracking): rotating a
 * session's refresh token must bump `last_used_at` on the row, not merely
 * update the hash/expiry. This is the persistence half of the contract that
 * `ListSessionsUseCase` relies on to report a session's last activity — a
 * unit test with a mocked repository cannot prove the column is actually
 * written by Prisma's `update`.
 *
 * Run via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/session-last-used-at.integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaSessionRepository } from '../../../src/modules/auth/infrastructure/prisma-session.repository';

let harness: DbHarness;
let repo: PrismaSessionRepository;

beforeAll(async () => {
  harness = await setupDbHarness();
  repo = new PrismaSessionRepository(harness.prisma);
}, 120_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

async function seedUserAndSession(oldHash: string): Promise<{ sessionId: string }> {
  const userId = crypto.randomUUID();
  await harness.prisma.user.create({
    data: {
      id: userId,
      tenant_id: null,
      branch_id: null,
      role: 'AM',
      name: 'Last Used At User',
      email: `last-used-${userId}@x.com`,
      phone: null,
      status: 'ACTIVE',
      password_hash: 'not-a-real-hash',
      totp_enabled: false,
      failed_login_count: 0,
      deleted_at: null,
    },
  });
  const sessionId = crypto.randomUUID();
  await harness.prisma.session.create({
    data: {
      id: sessionId,
      user_id: userId,
      refresh_token_hash: oldHash,
      expires_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      last_used_at: null,
    },
  });
  return { sessionId };
}

describe('PrismaSessionRepository.rotateRefreshToken (last_used_at)', () => {
  it('bumps last_used_at from null to a real timestamp on successful rotation', async () => {
    const oldHash = createHash('sha256').update('current-token').digest('hex');
    const { sessionId } = await seedUserAndSession(oldHash);

    const before = await harness.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(before.last_used_at).toBeNull();

    const newHash = createHash('sha256').update('rotated-token').digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const beforeRotate = new Date();

    const rotated = await repo.rotateRefreshToken(sessionId, oldHash, newHash, expiresAt);
    expect(rotated).toBe(true);

    const after = await harness.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(after.last_used_at).not.toBeNull();
    expect(after.last_used_at!.getTime()).toBeGreaterThanOrEqual(beforeRotate.getTime() - 1000);
  });
});
