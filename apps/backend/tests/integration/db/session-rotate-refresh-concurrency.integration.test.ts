/**
 * Real-database concurrency proof for PrismaSessionRepository.rotateRefreshToken
 * (#117). Two concurrent rotations that both present the SAME current refresh
 * hash must yield exactly one winner — the atomic compare-and-swap
 * (`updateMany` on the old hash) is what makes reuse detectable. The previous
 * two-step implementation (`findByRefreshTokenHash` then unconditional
 * `updateRefreshToken`) would let BOTH callers succeed, so this test fails
 * against that design and passes only with the CAS.
 *
 * Run via:
 *   pnpm exec vitest run --config vitest.integration-db.config.ts \
 *     tests/integration/db/session-rotate-refresh-concurrency.integration.test.ts
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
      name: 'Rotation User',
      email: `rotate-${userId}@x.com`,
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
    },
  });
  return { sessionId };
}

describe('PrismaSessionRepository.rotateRefreshToken (concurrency)', () => {
  it('lets exactly one of two concurrent rotations of the same hash win', async () => {
    const oldHash = createHash('sha256').update('the-current-token').digest('hex');
    const { sessionId } = await seedUserAndSession(oldHash);

    const newHashA = createHash('sha256').update('rotation-A').digest('hex');
    const newHashB = createHash('sha256').update('rotation-B').digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    const [a, b] = await Promise.all([
      repo.rotateRefreshToken(sessionId, oldHash, newHashA, expiresAt),
      repo.rotateRefreshToken(sessionId, oldHash, newHashB, expiresAt),
    ]);

    // Exactly one CAS wins.
    expect([a, b].filter(Boolean)).toHaveLength(1);

    // The stored hash is the winner's, and no longer the old one.
    const row = await harness.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(row.refresh_token_hash).not.toBe(oldHash);
    expect([newHashA, newHashB]).toContain(row.refresh_token_hash);
  });

  it('returns false when the presented hash no longer matches (reuse)', async () => {
    const oldHash = createHash('sha256').update('token-v1').digest('hex');
    const { sessionId } = await seedUserAndSession(oldHash);
    const rotatedHash = createHash('sha256').update('token-v2').digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    // First rotation succeeds and advances the hash.
    expect(await repo.rotateRefreshToken(sessionId, oldHash, rotatedHash, expiresAt)).toBe(true);
    // Replaying the now-stale old hash must lose the CAS.
    const replay = createHash('sha256').update('token-v3').digest('hex');
    expect(await repo.rotateRefreshToken(sessionId, oldHash, replay, expiresAt)).toBe(false);
  });

  it('returns false for a revoked session', async () => {
    const oldHash = createHash('sha256').update('token-revoked').digest('hex');
    const { sessionId } = await seedUserAndSession(oldHash);
    await harness.prisma.session.update({
      where: { id: sessionId },
      data: { revoked_at: new Date() },
    });
    const newHash = createHash('sha256').update('token-after-revoke').digest('hex');
    expect(
      await repo.rotateRefreshToken(sessionId, oldHash, newHash, new Date(Date.now() + 1000)),
    ).toBe(false);
  });
});
