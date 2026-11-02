import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PostgresRoutingRateLimiter } from '../../../src/modules/day-plan/infrastructure/routing/postgres-routing-rate-limiter';
import type { RoutingRateBucket } from '../../../src/modules/day-plan/domain/routing-rate-limiter';

describe('PostgresRoutingRateLimiter (real DB)', () => {
  let harness: DbHarness;
  let prisma2: PrismaClient;
  let limiter: PostgresRoutingRateLimiter;

  beforeAll(async () => {
    harness = await setupDbHarness();
    prisma2 = new PrismaClient({ datasources: { db: { url: harness.connectionString } } });
    await prisma2.$connect();
    limiter = new PostgresRoutingRateLimiter(harness.prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma2?.$disconnect();
    await teardownDbHarness(harness);
  });

  async function resetBucket(bucket: RoutingRateBucket, tokens: number): Promise<void> {
    await harness.prisma.$executeRawUnsafe(
      `UPDATE routing_rate_limit_buckets SET tokens = $1, refilled_at = clock_timestamp() WHERE bucket = $2`,
      tokens,
      bucket,
    );
  }

  beforeEach(async () => {
    // Full buckets, clock just set, so no phantom refill leaks between tests.
    await resetBucket('matrix:driving-traffic', 25);
    await resetBucket('matrix:driving', 50);
    await resetBucket('directions', 250);
  });

  it('grants the full capacity, refuses the next with maxWait 0, then grants after refill', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 25; i += 1) {
      results.push(await limiter.acquire('matrix:driving-traffic', 0));
    }
    expect(results.every(Boolean)).toBe(true);

    // 26th immediately -> budget exhausted.
    expect(await limiter.acquire('matrix:driving-traffic', 0)).toBe(false);

    // Simulate 2.4 s of elapsed DB time from empty: 2.4 * 25/60 = exactly 1 token.
    await harness.prisma.$executeRawUnsafe(
      `UPDATE routing_rate_limit_buckets SET tokens = 0, refilled_at = clock_timestamp() - interval '2.4 seconds' WHERE bucket = 'matrix:driving-traffic'`,
    );
    expect(await limiter.acquire('matrix:driving-traffic', 0)).toBe(true);
  });

  it('two connections racing 30 acquires grant exactly 25 (atomic UPDATE RETURNING)', async () => {
    await resetBucket('matrix:driving-traffic', 25);
    const l1 = new PostgresRoutingRateLimiter(harness.prisma);
    const l2 = new PostgresRoutingRateLimiter(prisma2);

    const tasks: Array<Promise<boolean>> = [];
    for (let i = 0; i < 30; i += 1) {
      tasks.push((i % 2 === 0 ? l1 : l2).acquire('matrix:driving-traffic', 0));
    }
    const granted = (await Promise.all(tasks)).filter(Boolean).length;
    expect(granted).toBe(25);
  });

  it('drain empties the bucket; the next acquire waits for refill; buckets are independent', async () => {
    await limiter.drain('matrix:driving-traffic');
    expect(await limiter.acquire('matrix:driving-traffic', 0)).toBe(false);

    // A different bucket is untouched by draining matrix:*.
    expect(await limiter.acquire('directions', 0)).toBe(true);

    // matrix only passes again once enough time has elapsed.
    await harness.prisma.$executeRawUnsafe(
      `UPDATE routing_rate_limit_buckets SET tokens = 0, refilled_at = clock_timestamp() - interval '2.4 seconds' WHERE bucket = 'matrix:driving-traffic'`,
    );
    expect(await limiter.acquire('matrix:driving-traffic', 0)).toBe(true);
  });

  it('acquire(maxWaitMs) polls and succeeds once a token refills in real time', async () => {
    await harness.prisma.$executeRawUnsafe(
      `UPDATE routing_rate_limit_buckets SET tokens = 0, refilled_at = clock_timestamp() WHERE bucket = 'matrix:driving-traffic'`,
    );
    const start = Date.now();
    const ok = await limiter.acquire('matrix:driving-traffic', 4000);
    expect(ok).toBe(true);
    // Needed ~2.4 s of refill; proves it actually waited rather than granting early.
    expect(Date.now() - start).toBeGreaterThanOrEqual(2000);
  }, 10_000);
});
