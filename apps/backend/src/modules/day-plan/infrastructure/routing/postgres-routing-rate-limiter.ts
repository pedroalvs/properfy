import { type Prisma, type PrismaClient } from '@prisma/client';
import type { IRoutingRateLimiter, RoutingRateBucket } from '../../domain/routing-rate-limiter';

const DEFAULT_POLL_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Token bucket in Postgres (D16/D17). One atomic UPDATE refills with the
 * DATABASE clock (clock_timestamp()) and consumes a token in the same
 * statement; its row lock serializes the Fly machines, so the Mapbox budget is
 * respected cluster-wide. Each environment has its own database and tokens.
 */
export class PostgresRoutingRateLimiter implements IRoutingRateLimiter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pollMs: number = DEFAULT_POLL_MS,
  ) {}

  async acquire(bucket: RoutingRateBucket, maxWaitMs: number): Promise<boolean> {
    const deadline = Date.now() + maxWaitMs;
    for (;;) {
      if (await this.tryTake(bucket)) return true;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      await delay(Math.min(this.pollMs, remaining));
    }
  }

  async drain(bucket: RoutingRateBucket): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE routing_rate_limit_buckets
      SET tokens = 0, refilled_at = clock_timestamp()
      WHERE bucket = ${bucket}
    `;
  }

  /**
   * Atomic refill-and-consume. Refills to `capacity` at `refill_per_minute`
   * since `refilled_at`; grants a token only when the refilled balance is >= 1.
   * One row back = granted, zero rows = budget exhausted this instant.
   */
  private async tryTake(bucket: RoutingRateBucket): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ tokens: Prisma.Decimal }>>`
      UPDATE routing_rate_limit_buckets
      SET tokens = LEAST(
            capacity,
            tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0
          ) - 1,
          refilled_at = clock_timestamp()
      WHERE bucket = ${bucket}
        AND LEAST(
          capacity,
          tokens + extract(epoch FROM (clock_timestamp() - refilled_at)) * refill_per_minute / 60.0
        ) >= 1
      RETURNING tokens
    `;
    return rows.length > 0;
  }
}
